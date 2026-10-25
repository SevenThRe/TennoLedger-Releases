"""Extract trade intentions only. A whisper never proves a completed trade."""
import re
import hashlib

def candidates(text):
    patterns = [
        r'(?:want to|would like to)\s+(buy|sell)\s+\[(.+?)\].*?\bfor\s+(\d+)\s*(?:platinum|plat|p)\b',
        r'(购买|出售|收购)\s*[\[【](.+?)[\]】].*?(\d+)\s*白金',
    ]
    result=[]
    for pattern in patterns:
        for match in re.finditer(pattern,text,re.I):
            intent,name,price=match.groups()
            amount=int(price)
            if not 0<amount<=1000000000: continue
            fingerprint=hashlib.sha256(match.group(0).casefold().encode()).hexdigest()
            result.append(dict(id=fingerprint,name=name.strip(),platinum=amount,quantity=1,
                               intent=intent,source='chat-ocr',status='pending'))
    return result
