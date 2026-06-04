import re

with open('D:/ArduinoDataLOG/WebApp/frontend/public/logo.svg', 'r', encoding='utf-8') as f:
    content = f.read()

# The regex will match <path ... /> that do NOT contain fill="#023F72"
cleaned = re.sub(r'<path[^>]*fill=\"#(?!023F72)[0-9A-Fa-f]{6}\"[^>]*/>\s*', '', content)
# And handle paths where fill is at the end or somewhere else but not 023F72
# Actually, since it's an auto-traced SVG, the structure is usually very predictable: <path fill="..." ... d="..."/>
cleaned = re.sub(r'<path fill=\"#(?!023F72)[0-9A-Fa-f]{6}\"[^>]*d=\"[^\"]*\"\s*/>\s*', '', cleaned)

# Just to be safe and catch the exact format we saw in head:
# <path fill="#E6E6E6" opacity="1.000000" stroke="none" \n\td="\nM...z"/>
# We can use a simpler approach: split by '<path ' and filter.
parts = content.split('<path ')
final_parts = [parts[0]] # header

for part in parts[1:]:
    if 'fill="#023F72"' in part:
        # replace the color so we can style it via CSS (currentColor inherits text color)
        modified_part = part.replace('fill="#023F72"', 'fill="currentColor"')
        final_parts.append('<path ' + modified_part)

with open('D:/ArduinoDataLOG/WebApp/frontend/public/logo_clean.svg', 'w', encoding='utf-8') as f:
    f.write("".join(final_parts))

print("Cleaned SVG written.")
