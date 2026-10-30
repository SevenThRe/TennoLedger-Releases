"""Foreground-only local collection worker. stdout is a versioned JSONL protocol."""
import argparse
import ctypes
from ctypes import wintypes
from datetime import datetime, timezone
import json
import itertools
import os
from pathlib import Path
import re
import sys
import time
from relic import normalize
from trade_chat import candidates
from riven_capture import CaptureCatalog, capture_events

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='strict')


def emit(kind, **fields):
    print(json.dumps(dict(schemaVersion=1, type=kind, **fields), ensure_ascii=False), flush=True)


def timestamp():
    return datetime.now(timezone.utc).isoformat()


_capture_ids = itertools.count(1)


class CaptureRecord:
    """Bind every OCR result to the start of one frame acquisition."""
    def __init__(self):
        self.capture_id = f'{os.getpid()}:{next(_capture_ids)}'

    def __enter__(self):
        emit('capture-start', captureId=self.capture_id, startedAt=timestamp())
        return self

    def emit(self, kind, **fields):
        emit(kind, **{**fields, 'captureId': self.capture_id})

    def __exit__(self, exc_type, exc_value, traceback):
        emit('capture-end', captureId=self.capture_id)
        return False


class Tail:
    """Read new complete lines only; drop oversized/partial records on replacement."""
    def __init__(self, path, replay=False):
        self.path, self.identity, self.offset, self.pending = Path(path), None, 0, b''
        self.replay, self.initialized = replay, False

    def poll(self):
        try:
            with self.path.open('rb') as stream:
                st = os.fstat(stream.fileno())
                identity = (st.st_dev, st.st_ino)
                if not self.initialized:
                    self.offset = 0 if self.replay else st.st_size
                    self.initialized = True
                elif identity != self.identity or st.st_size < self.offset:
                    self.offset, self.pending = 0, b''
                self.identity = identity
                stream.seek(self.offset)
                chunk = stream.read(262144)
                self.offset = stream.tell()
        except FileNotFoundError:
            return []
        records = (self.pending + chunk).split(b'\n')
        self.pending = records.pop()
        if len(self.pending) > 65536:
            self.pending = b''
            self.discard = True
        else:
            self.discard = getattr(self, 'discard', False)
        if records and self.discard:
            records.pop(0)
            self.discard = False
        return [line.decode('utf-8', errors='replace').rstrip('\r') for line in records if len(line) <= 65536]


class Signals:
    def __init__(self):
        self.requiem = False

    def accept(self, line):
        if '"activeMissionTag" : "' in line or 'activeMissionTag=' in line:
            tail = line.split('"activeMissionTag" : "', 1)[-1] if '"activeMissionTag" : "' in line else line.split('activeMissionTag=', 1)[1]
            self.requiem = 'VoidT5' in tail
            return False
        return ('Got rewards' in line or 'Created /Lotus/Interface/ProjectionRewardChoice.swf' in line) and not self.requiem


def reward_screen_closed(line):
    return any(marker in line for marker in (
        'ProjectionRewardChoice.lua: Reward choice force closed',
        'ProjectionRewardChoice.lua: Relic reward screen shut down',
    ))


class Aliases:
    def __init__(self, items):
        self.aliases = {}
        for item in items:
            names = [item.get('name', ''), item.get('zh', '')]
            for values in item.get('names', {}).values():
                names.extend(values)
            for name in names:
                key = normalize(name)
                if key:
                    self.aliases.setdefault(key, set()).add(item['id'])

        by_id = {item['id']: item for item in items}
        generic = {'Blueprint', 'Handle', 'Blade', 'Barrel', 'Stock', 'Receiver', 'Chassis', 'Neuroptics', 'Systems', 'Ornament', 'String', 'Grip', 'Link', 'Pouch', 'Stars', 'Boot', 'Gauntlet', 'Head'}
        for parent in items:
            for part in (parent.get('recipe') or {}).get('parts', []):
                child = by_id.get(part['itemId'], {})
                if child.get('name') not in generic:
                    continue
                for name in (parent.get('name','') + ' ' + child['name'], parent.get('zh','') + ' ' + (child.get('zh') or {'Blueprint':'蓝图'}.get(child.get('name'),''))):
                    if normalize(name) and name.strip() not in (parent.get('zh'), parent.get('name')):
                        self.aliases.setdefault(normalize(name), set()).add(child['id'])

    def exact(self, text):
        ids = self.aliases.get(normalize(text), set())
        return next(iter(ids)) if len(ids) == 1 else None


def lines_from_ocr(result):
    lines = []
    for box, text, confidence in result or []:
        if confidence < .85 or len(text) > 180:
            continue
        xs, ys = [p[0] for p in box], [p[1] for p in box]
        lines.append(dict(text=text.strip(), confidence=float(confidence), x=min(xs), y=min(ys), w=max(xs)-min(xs), h=max(ys)-min(ys)))
    return lines


def reward_scale_bounds(height, settings):
    mode = settings.get('mode', 'full')
    percent = settings.get('percent', 100)
    if mode not in ('full', 'legacy', 'custom') or type(percent) is not int or not 25 <= percent <= 400:
        raise ValueError('Invalid Warframe menu scale')
    scale = percent / 100 if mode == 'custom' else .74 if mode == 'legacy' and height > 1080 else 1
    top, bottom = (.25, .4685) if mode == 'legacy' else (.2, .4625)
    return max(0, .5 + scale * (top - .5)), min(1, .5 + scale * (bottom - .5))


def reward_scale_settings(path):
    if not path or not path.is_file():
        return dict(mode='full', percent=100)
    raw = path.read_bytes()
    if len(raw) > 4096:
        raise ValueError('Menu scale settings too large')
    return json.loads(raw.decode('utf-8-sig'))


def reward_cards(lines, aliases, width, height, menu_scale=None):
    # Reward names occupy the central strip; cluster aligned wrapped lines before matching.
    top, bottom = reward_scale_bounds(height, menu_scale) if menu_scale is not None else (.18, .55)
    candidates = [l for l in lines if top*height < l['y'] < min(.6,bottom+.035)*height and l['w'] < .44*width]
    groups = []
    for line in sorted(candidates, key=lambda l: l['y']):
        cx = line['x'] + line['w']/2
        group = next((g for g in groups if abs(cx-(g[0]['x']+g[0]['w']/2)) < .045*width and -.01*height <= line['y']-(g[-1]['y']+g[-1]['h']) < .045*height), None)
        if group is None:
            groups.append([line])
        else:
            group.append(line)
    cards = []
    for group in groups:
        # A name may be one or several contiguous text lines, but ambiguous aliases stay unresolved.
        matches = []
        for start in range(len(group)):
            for end in range(start+1, min(start+4, len(group))+1):
                text = ' '.join(l['text'] for l in group[start:end])
                item = aliases.exact(text)
                if item:
                    matches.append((end-start, item, text, group[start:end]))
        if not matches:
            text = ' '.join(l['text'] for l in group)
            if 'prime' in normalize(text):
                x,y=min(l['x'] for l in group),min(l['y'] for l in group)
                cards.append(dict(itemId=None,text=text,matchStatus='unresolved',box=[x,y,max(l['x']+l['w'] for l in group)-x,max(l['y']+l['h'] for l in group)-y]))
            continue
        longest = max(m[0] for m in matches)
        matches = [m for m in matches if m[0] == longest]
        if len({m[1] for m in matches}) != 1:
            continue
        _, item, text, used = matches[0]
        if not any(token in normalize(text) for token in ('prime','blueprint','蓝图')):
            continue
        x,y = min(l['x'] for l in used), min(l['y'] for l in used)
        cards.append(dict(itemId=item,text=text,matchStatus='matched',ocrConfidence=min(l['confidence'] for l in used),box=[x,y,max(l['x']+l['w'] for l in used)-x,max(l['y']+l['h'] for l in used)-y]))
    cards.sort(key=lambda c: c['box'][0])
    # More than four matching groups is not the reward selection screen.
    return cards if 1 <= len(cards) <= 4 else []


def inventory_observations(lines, aliases, width, height):
    if not any(normalize(l['text']) in ('inventory', '物品仓库', '仓库') and l['y'] < .25*height for l in lines):
        return []
    observations = {}
    counts = [l for l in lines if re.fullmatch(r'[xX×]\s*[0-9][0-9,]*', l['text'])]
    for line in lines:
        item = aliases.exact(line['text'])
        if not item or line['y'] < .25*height:
            continue
        # Only a separately printed xN immediately above/right of this name, in its tile.
        matches = [c for c in counts if abs(c['x']-line['x']) < .12*width and -.12*height < c['y']-line['y'] < .025*height]
        if len(matches) != 1:
            continue
        count = int(re.sub(r'[^0-9]', '', matches[0]['text']))
        if not 0 <= count <= 2**32-1 or item in observations:
            return []
        # A count cannot belong to two nearby names.
        nearby = [l for l in lines if aliases.exact(l['text']) and abs(matches[0]['x']-l['x']) < .12*width and -.12*height < matches[0]['y']-l['y'] < .025*height]
        if len(nearby) != 1:
            continue
        observations[item] = count
    return [dict(itemId=k, quantity=v) for k,v in sorted(observations.items())]


class Confirmation:
    def __init__(self):
        self.previous, self.emitted = [], []

    def accept(self, current):
        stable = bool(current and current == self.previous and current != self.emitted)
        self.previous = current
        if stable:
            self.emitted = current
        return stable


def capture_game():
    if sys.platform != 'win32':
        raise RuntimeError('Windows required')
    from PIL import ImageGrab
    user = ctypes.WinDLL('user32', use_last_error=True)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    user.GetForegroundWindow.restype = wintypes.HWND
    hwnd = user.GetForegroundWindow()
    pid = wintypes.DWORD()
    user.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    kernel.OpenProcess.argtypes = [wintypes.DWORD,wintypes.BOOL,wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    handle = kernel.OpenProcess(0x1000, False, pid.value)
    if not handle:
        raise RuntimeError('No foreground game')
    try:
        buf, size = ctypes.create_unicode_buffer(32768), wintypes.DWORD(32768)
        kernel.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE,wintypes.DWORD,wintypes.LPWSTR,ctypes.POINTER(wintypes.DWORD)]
        if not kernel.QueryFullProcessImageNameW(handle,0,buf,ctypes.byref(size)) or Path(buf.value).name.casefold() not in ('warframe.x64.exe','warframe.exe'):
            raise RuntimeError('Foreground process is not Warframe')
    finally:
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        kernel.CloseHandle(handle)
    title = ctypes.create_unicode_buffer(512)
    user.GetWindowTextW.argtypes = [wintypes.HWND,wintypes.LPWSTR,ctypes.c_int]
    user.GetWindowTextW(hwnd,title,512)
    if 'warframe' not in title.value.casefold():
        raise RuntimeError('Unexpected game title')
    try:
        user.SetProcessDPIAware()
    except AttributeError:
        pass
    rect, point = wintypes.RECT(), wintypes.POINT()
    user.GetClientRect.argtypes = [wintypes.HWND,ctypes.POINTER(wintypes.RECT)]
    user.ClientToScreen.argtypes = [wintypes.HWND,ctypes.POINTER(wintypes.POINT)]
    if not user.GetClientRect(hwnd,ctypes.byref(rect)) or not user.ClientToScreen(hwnd,ctypes.byref(point)) or rect.right < 200 or rect.bottom < 200:
        raise RuntimeError('Invalid client bounds')
    image = ImageGrab.grab(bbox=(point.x,point.y,point.x+rect.right,point.y+rect.bottom), all_screens=True)
    if user.GetForegroundWindow() != hwnd:
        raise RuntimeError('Foreground changed during capture')
    return image


def parent_alive(pid):
    if pid is None:
        return True
    if sys.platform != 'win32':
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD,wintypes.BOOL,wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE,wintypes.DWORD]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.OpenProcess(0x101000, False, pid)
    if not handle:
        return False
    try:
        return kernel.WaitForSingleObject(handle,0) == 258
    finally:
        kernel.CloseHandle(handle)


def relic_selection_era(lines,width,height):
    """Only the explicit tier heading inside the selection title crop, never list entries."""
    aliases={'Lith':('lith','古纪','古世纪','古世紀'),'Meso':('meso','前纪','前世纪','前世紀'),'Neo':('neo','中纪','中世纪','中世紀'),'Axi':('axi','后纪','后世纪','後世紀'),'Requiem':('requiem','安魂')}
    found=set()
    for row in lines:
        if row.get('confidence',0)<.85 or row.get('x',-1)<0 or row.get('y',-1)<0 or row['x']+row['w']>width*.21 or row['y']+row['h']>height*.21:
            continue
        value=row.get('text','').strip().casefold()
        for era,words in aliases.items():
            if any(re.search(r'(?<![a-z])'+re.escape(word)+r'(?![a-z])',value) if word.isascii() else word in value for word in words):
                found.add(era)
    return next(iter(found)) if len(found)==1 else None


class RelicSelectionSession:
    """One UI visit, heartbeats while present, and a fresh visit after leaving."""
    def __init__(self):
        self.session_id = None
        self.era = None
        self.misses = 0
        self.last_emit = -100
        self.serial = 0

    def observe(self, era, now):
        if era is None:
            self.misses += 1
            if self.session_id and self.misses >= 2:
                result = ('relic-selection-ended', dict(selectionSession=self.session_id))
                self.session_id, self.era = None, None
                return result
            return None
        self.misses = 0
        changed = era != self.era
        if self.session_id is None:
            self.serial += 1
            self.session_id = f'{os.getpid()}-{time.monotonic_ns()}-{self.serial}'
            changed = True
        self.era = era
        if changed or now-self.last_emit >= 10:
            self.last_emit = now
            return ('relic-selection', dict(era=era, selectionSession=self.session_id))
        return None


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--catalog', type=Path)
    p.add_argument('--riven-catalog', type=Path)
    p.add_argument('--menu-scale-config', type=Path)
    p.add_argument('--log', type=Path, default=Path(os.environ.get('LOCALAPPDATA','.'))/'Warframe'/'EE.log')
    p.add_argument('--watch', action='store_true')
    p.add_argument('--inventory-ocr', action='store_true', help='Developer opt-in partial inventory screen experiment')
    p.add_argument('--parent-pid', type=int)
    p.add_argument('--replay-log', action='store_true')
    p.add_argument('--once-image', type=Path)
    p.add_argument('--self-test', action='store_true')
    args = p.parse_args()
    if args.self_test:
        emit('status', code='self-test-ok')
        return
    if not args.catalog:
        p.error('--catalog required')
    aliases = Aliases(json.loads(args.catalog.read_text(encoding='utf-8-sig'))['items'])
    riven_catalog = CaptureCatalog.from_files(args.riven_catalog) if args.riven_catalog else None
    last_riven = None
    last_console = -100
    selection_session = RelicSelectionSession()
    from rapidocr_onnxruntime import RapidOCR
    import numpy as np
    engine = RapidOCR(intra_op_num_threads=2, inter_op_num_threads=1)
    tail, signals, confirm = Tail(args.log,args.replay_log), Signals(), Confirmation()
    last_status, due, next_scan, last_reward = None, None, 0, -100
    reward_until, reward_misses = 0, 0
    def status(code):
        nonlocal last_status
        if code != last_status:
            emit('status',code=code)
            last_status = code
    while parent_alive(args.parent_pid):
        for line in tail.poll():
            if reward_screen_closed(line):
                due=None
                reward_until=0
                with CaptureRecord() as capture:
                    capture.emit('relic-rewards-ended',capturedAt=timestamp(),evidence='game-log')
            if 'UIConsoleTrigger::Open()' in line:
                last_console=time.monotonic()
            if 'ThemedProjectionManager.lua: LoadingCompleteEnd' in line and time.monotonic()-last_console>1:
                next_scan=time.monotonic()+.75
            if 'ThemedDetailedPurchaseDialog.lua: PopulateInfo->/Lotus/StoreItems/Upgrades/Mods/Randomized/' in line:
                next_scan = time.monotonic()+.45
            if signals.accept(line) and time.monotonic()-last_reward > 2:
                last_reward = time.monotonic()
                due = last_reward+.65
                reward_until = last_reward+18
                reward_misses = 0
        if not args.inventory_ocr and due is None:
            status('watching' if args.log.exists() else 'waiting-log')
        reward = due is not None and time.monotonic() >= due
        if args.once_image or reward or time.monotonic() >= next_scan:
            reward_scan = bool(reward or args.once_image or time.monotonic()<reward_until)
            next_scan = time.monotonic()+(.5 if time.monotonic()<reward_until else 1)
            if reward:
                due = None
            with CaptureRecord() as capture:
                try:
                    if args.once_image:
                        from PIL import Image
                        image = Image.open(args.once_image).convert('RGB')
                    else:
                        image = capture_game()
                except Exception:
                    confirm.previous = []
                    status('waiting-game')
                    if args.once_image:
                        raise
                    time.sleep(.2)
                    continue
                try:
                    result,_ = engine(np.asarray(image.convert('RGB'))[:,:,::-1].copy())
                    lines = lines_from_ocr(result)
                    # Observe the explicit heading continuously. A log event can
                    # be missed on startup and the player may stay here >30s.
                    selection = selection_session.observe(relic_selection_era(lines,*image.size),time.monotonic())
                    if selection:
                        kind, fields = selection
                        capture.emit(kind,capturedAt=timestamp(),evidence='synthetic-ocr' if args.once_image else 'ocr',**fields)
                    if riven_catalog is not None:
                        events = capture_events(lines, *image.size, riven_catalog, synthetic=bool(args.once_image))
                        if not events:
                            last_riven = None
                        for event in events:
                            semantic = [{key:card.get(key) for key in ('weaponId','rivenName','masteryLevel','rank','rerolls')} | {'attributes':[(a.get('slug'),a.get('signedValue'),a.get('unit')) for a in card.get('attributes',[])]} for card in event.get('cards',[])]
                            signature = json.dumps([event.get('mode'), semantic], sort_keys=True, ensure_ascii=True)
                            if signature != last_riven:
                                last_riven = signature
                                fields = {key:value for key,value in event.items() if key not in ('type','schemaVersion')}
                                capture.emit('riven-capture', capturedAt=timestamp(), **fields)
                    for candidate in candidates(' '.join(line['text'] for line in lines)):
                        capture.emit('trade-candidate', capturedAt=timestamp(), candidate=candidate)
                    status('watching' if args.log.exists() else 'waiting-log')
                    if reward_scan:
                        cards = reward_cards(lines, aliases, *image.size, menu_scale=reward_scale_settings(args.menu_scale_config))
                        if cards and relic_selection_era(lines,*image.size) is None:
                            reward_misses=0
                            reward_until=time.monotonic()+3
                            capture.emit('relic', capturedAt=timestamp(),status='matched' if all(c.get('itemId') for c in cards) else 'partial',cards=cards)
                        else:
                            reward_misses+=1
                            if reward_misses>=2:
                                capture.emit('relic-rewards-ended',capturedAt=timestamp(),evidence='ocr')
                                reward_until=0
                    if args.inventory_ocr and not reward and not args.once_image:
                        observations = inventory_observations(lines,aliases,*image.size)
                        if confirm.accept(observations):
                            capture.emit('inventory',capturedAt=timestamp(),source='screen-ocr',observations=observations)
                except Exception:
                    confirm.previous = []
                    status('ocr-error')
                if args.once_image:
                    break
        time.sleep(.1)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception:
        emit('status', code='ocr-error')
        sys.exit(1)
