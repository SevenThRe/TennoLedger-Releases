"""Local OCR adapter. Does not contact AlecaFrame or access game memory."""
import argparse
import ctypes
from ctypes import wintypes
import difflib
import json
from pathlib import Path
import re
import sys
import unicodedata


def normalize(text):
    return re.sub(r'[^\w]', '', unicodedata.normalize('NFKC', text).casefold())


def match_item(text, catalog, threshold=0.85):
    query = normalize(text)
    candidates = []
    for item in catalog:
        names = [name for names in item['names'].values() for name in names]
        score = max((difflib.SequenceMatcher(None, query, normalize(n)).ratio() for n in names), default=0)
        candidates.append({'id': item['id'], 'similarity': score})
    candidates.sort(key=lambda x: (-x['similarity'], x['id']))
    best = candidates[0] if candidates else None
    # Ambiguous names must remain unresolved, even with a high similarity.
    accepted = bool(query and best and best['similarity'] >= threshold and
                    (len(candidates) < 2 or best['similarity'] - candidates[1]['similarity'] >= 0.05))
    return {'itemId': best['id'] if accepted else None, 'matchStatus': 'matched' if accepted else 'unresolved', 'candidates': candidates[:3]}


def load_catalog(path):
    if path is None:
        return []
    data = json.loads(Path(path).read_text(encoding='utf-8-sig'))
    if data.get('schemaVersion') != 1 or not isinstance(data.get('items'), list):
        raise ValueError('Invalid catalog schema')
    ids = set()
    for item in data['items']:
        if not isinstance(item.get('id'), str) or not item['id'] or item['id'] in ids:
            raise ValueError('Invalid or duplicate stable ID')
        ids.add(item['id'])
        if not isinstance(item.get('names'), dict):
            raise ValueError('Invalid names')
        for names in item['names'].values():
            if not isinstance(names, list) or not names or any(not isinstance(n, str) or not normalize(n) for n in names):
                raise ValueError('Names must be nonempty string arrays')
    return data['items']


def capture_window(title):
    if sys.platform != 'win32':
        raise RuntimeError('Window capture requires Windows')
    from PIL import ImageGrab
    user32 = ctypes.WinDLL('user32', use_last_error=True)
    try:
        user32.SetProcessDPIAware()
    except AttributeError:
        pass
    user32.GetForegroundWindow.restype = wintypes.HWND
    user32.IsWindowVisible.argtypes = [wintypes.HWND]
    user32.IsIconic.argtypes = [wintypes.HWND]
    user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
    user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    matches = []
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def visit(hwnd, _):
        length = user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        if user32.IsWindowVisible(hwnd) and title.casefold() in buf.value.casefold():
            matches.append(hwnd)
        return True
    user32.EnumWindows(callback_type(visit), 0)
    if len(matches) != 1:
        raise RuntimeError(f'Expected one visible game window, found {len(matches)}')
    hwnd = matches[0]
    if user32.IsIconic(hwnd) or user32.GetForegroundWindow() != hwnd:
        raise RuntimeError('Game must be foreground and not minimized; refusing obscured capture')
    user32.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
    user32.ClientToScreen.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.POINT)]
    rect, origin = wintypes.RECT(), wintypes.POINT(0, 0)
    if not user32.GetClientRect(hwnd, ctypes.byref(rect)) or not user32.ClientToScreen(hwnd, ctypes.byref(origin)):
        raise ctypes.WinError(ctypes.get_last_error())
    if rect.right <= 0 or rect.bottom <= 0:
        raise RuntimeError('Empty game client rectangle')
    return ImageGrab.grab(bbox=(origin.x, origin.y, origin.x + rect.right, origin.y + rect.bottom), all_screens=True)


def recognize(image, catalog, roi=None):
    import numpy as np
    from rapidocr_onnxruntime import RapidOCR
    width, height = image.size
    offset_x = offset_y = 0
    if roi:
        x, y, w, h = roi
        if min(roi) < 0 or w <= 0 or h <= 0 or x + w > 1 or y + h > 1:
            raise ValueError('ROI must fit normalized image coordinates')
        offset_x, offset_y = int(x * width), int(y * height)
        image = image.crop((offset_x, offset_y, int((x+w)*width), int((y+h)*height)))
    result, _ = RapidOCR()(np.asarray(image.convert('RGB'))[:, :, ::-1].copy())
    lines = []
    for box, text, confidence in result or []:
        lines.append({'text': text, 'ocrConfidence': float(confidence),
                      'box': [[float(x)+offset_x, float(y)+offset_y] for x, y in box],
                      **match_item(text, catalog)})
    return {'schemaVersion': 1, 'source': 'local-ocr', 'imageSize': [width, height],
            'status': 'text-detected' if lines else 'no-text', 'lines': lines,
            'limitations': ['Text lines are not yet grouped into 1-4 reward cards.',
                            'OCR confidence and catalog similarity are not calibrated probabilities.']}


def main():
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--image', type=Path)
    source.add_argument('--window-title', help='Unique visible game window title substring')
    parser.add_argument('--roi', type=float, nargs=4, metavar=('X', 'Y', 'W', 'H'))
    parser.add_argument('--catalog', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    from PIL import Image
    catalog = load_catalog(args.catalog)
    image = Image.open(args.image).convert('RGB') if args.image else capture_window(args.window_title)
    result = recognize(image, catalog, args.roi)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'status': result['status'], 'lines': len(result['lines']), 'output': str(args.output)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
