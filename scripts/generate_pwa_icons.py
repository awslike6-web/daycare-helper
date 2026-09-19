import math
from PIL import Image, ImageDraw, ImageFont

def create_bear_icon(size):
    # RGBA 이미지 생성
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 1. 부드러운 둥근 사각형 배경 (세련된 소프트 인디고/블루 #6366F1 -> #4F46E5)
    margin = size * 0.04
    radius = size * 0.22
    bg_box = [margin, margin, size - margin, size - margin]
    draw.rounded_rectangle(bg_box, radius=radius, fill=(99, 102, 241, 255))
    
    # 상단 하이라이트 은은한 그라데이션 효과
    highlight_box = [margin, margin, size - margin, size * 0.5]
    draw.rounded_rectangle(highlight_box, radius=radius, fill=(129, 140, 248, 80))

    # 2. 귀여운 테디베어 그리기
    cx, cy = size * 0.5, size * 0.53
    scale = size / 512.0
    
    bear_brown = (217, 119, 6) # 골드브라운
    ear_inner = (254, 215, 170) # 연한 베이지
    snout_color = (254, 243, 199) # 주둥이 미색
    eye_color = (30, 27, 75) # 짙은 남색 눈
    nose_color = (120, 53, 15) # 짙은 밤색 코
    blush_color = (251, 113, 133, 160) # 핑크 볼터치

    # 2-1. 귀 (왼쪽, 오른쪽)
    ear_r = 55 * scale
    # 왼귀
    lx, ly = cx - 110 * scale, cy - 105 * scale
    draw.ellipse([lx - ear_r, ly - ear_r, lx + ear_r, ly + ear_r], fill=bear_brown)
    draw.ellipse([lx - ear_r*0.6, ly - ear_r*0.6, lx + ear_r*0.6, ly + ear_r*0.6], fill=ear_inner)
    # 오른귀
    rx, ry = cx + 110 * scale, cy - 105 * scale
    draw.ellipse([rx - ear_r, ry - ear_r, rx + ear_r, ry + ear_r], fill=bear_brown)
    draw.ellipse([rx - ear_r*0.6, ry - ear_r*0.6, rx + ear_r*0.6, ry + ear_r*0.6], fill=ear_inner)

    # 2-2. 얼굴 본체 (통통한 타원)
    face_rx = 145 * scale
    face_ry = 125 * scale
    draw.ellipse([cx - face_rx, cy - face_ry, cx + face_rx, cy + face_ry], fill=bear_brown)

    # 2-3. 주둥이 (둥근 미색 영역)
    snout_rx = 70 * scale
    snout_ry = 50 * scale
    snout_cy = cy + 25 * scale
    draw.ellipse([cx - snout_rx, snout_cy - snout_ry, cx + snout_rx, snout_cy + snout_ry], fill=snout_color)

    # 2-4. 코 & 입
    nose_rx = 22 * scale
    nose_ry = 16 * scale
    draw.ellipse([cx - nose_rx, snout_cy - 20 * scale, cx + nose_rx, snout_cy + 12 * scale], fill=nose_color)
    # 입선
    draw.line([cx, snout_cy + 10 * scale, cx, snout_cy + 24 * scale], fill=nose_color, width=int(max(2, 4*scale)))
    # 미소
    smile_r = 18 * scale
    draw.arc([cx - smile_r, snout_cy + 14 * scale, cx + smile_r, snout_cy + 34 * scale], 0, 180, fill=nose_color, width=int(max(2, 4*scale)))

    # 2-5. 반짝이는 두 눈
    eye_r = 16 * scale
    eye_y = cy - 20 * scale
    # 왼눈
    draw.ellipse([cx - 65 * scale - eye_r, eye_y - eye_r, cx - 65 * scale + eye_r, eye_y + eye_r], fill=eye_color)
    draw.ellipse([cx - 68 * scale, eye_y - 8 * scale, cx - 60 * scale, eye_y], fill=(255, 255, 255))
    # 오른눈
    draw.ellipse([cx + 65 * scale - eye_r, eye_y - eye_r, cx + 65 * scale + eye_r, eye_y + eye_r], fill=eye_color)
    draw.ellipse([cx + 62 * scale, eye_y - 8 * scale, cx + 70 * scale, eye_y], fill=(255, 255, 255))

    # 2-6. 핑크 볼터치 (블러셔)
    blush_rx = 26 * scale
    blush_ry = 16 * scale
    blush_y = cy + 12 * scale
    # 오버레이로 반투명 블러셔
    blush_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(blush_img)
    b_draw.ellipse([cx - 105 * scale - blush_rx, blush_y - blush_ry, cx - 105 * scale + blush_rx, blush_y + blush_ry], fill=blush_color)
    b_draw.ellipse([cx + 105 * scale - blush_rx, blush_y - blush_ry, cx + 105 * scale + blush_rx, blush_y + blush_ry], fill=blush_color)
    img = Image.alpha_composite(img, blush_img)

    # 2-7. 작은 반짝이 별 (우상단)
    star_x = cx + 140 * scale
    star_y = cy - 120 * scale
    s_draw = ImageDraw.Draw(img)
    star_r = 20 * scale
    s_draw.ellipse([star_x - star_r, star_y - star_r*0.4, star_x + star_r, star_y + star_r*0.4], fill=(253, 224, 71, 240))
    s_draw.ellipse([star_x - star_r*0.4, star_y - star_r, star_x + star_r*0.4, star_y + star_r], fill=(253, 224, 71, 240))

    return img

# 192x192 및 512x512 생성 및 저장
icon_192 = create_bear_icon(192)
icon_192.save('public/icon-192.png', 'PNG')
print('Generated public/icon-192.png')

icon_512 = create_bear_icon(512)
icon_512.save('public/icon-512.png', 'PNG')
print('Generated public/icon-512.png')
