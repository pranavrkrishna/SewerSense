import os

path = 'D:/ArduinoDataLOG/WebApp/frontend/public/logo_clean.svg'
# Wait, logo_clean was written by python so it should be utf-8!
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

white_content = content.replace('fill="currentColor"', 'fill="#FFFFFF"')
with open('D:/ArduinoDataLOG/WebApp/frontend/public/logo_white.svg', 'w', encoding='utf-8') as f:
    f.write(white_content)

dark_content = content.replace('fill="currentColor"', 'fill="#171717"')
with open('D:/ArduinoDataLOG/WebApp/frontend/public/logo_dark.svg', 'w', encoding='utf-8') as f:
    f.write(dark_content)

print("Fixed encodings.")
