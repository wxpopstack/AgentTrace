#!/usr/bin/env python3
"""
将 SVG 图标转换为 Tauri 应用所需的各种格式。

依赖: cairosvg, pillow
运行: conda activate ztemp && python scripts/convert_icon.py
"""

import cairosvg
from PIL import Image
import io
import os
import subprocess
import shutil

# 路径配置
SVG_PATH = "icon.svg"
ICONS_DIR = os.path.join(os.path.dirname(__file__), 'src-tauri', 'icons')


def svg_to_png(size):
    """将 SVG 转换为指定尺寸的 PNG 数据"""
    return cairosvg.svg2png(url=SVG_PATH, output_width=size, output_height=size)


def save_png(size, filename):
    """保存 PNG 文件"""
    png_data = svg_to_png(size)
    img = Image.open(io.BytesIO(png_data))
    path = os.path.join(ICONS_DIR, filename)
    img.save(path)
    print(f'Generated {filename} ({size}x{size})')


def generate_pngs():
    """生成各尺寸 PNG 文件"""
    os.makedirs(ICONS_DIR, exist_ok=True)
    save_png(512, 'icon.png')
    save_png(32, '32x32.png')
    save_png(128, '128x128.png')
    save_png(256, '128x128@2x.png')


def generate_ico():
    """生成 Windows ICO 文件"""
    sizes_for_ico = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    images = []
    for w, h in sizes_for_ico:
        png_data = svg_to_png(w)
        images.append(Image.open(io.BytesIO(png_data)))

    ico_path = os.path.join(ICONS_DIR, 'icon.ico')
    images[0].save(ico_path, format='ICO', sizes=sizes_for_ico)
    print('Generated icon.ico')


def generate_icns():
    """生成 macOS ICNS 文件"""
    temp_dir = os.path.join(ICONS_DIR, 'icon.iconset')
    os.makedirs(temp_dir, exist_ok=True)

    # macOS iconset 需要的文件
    iconset_files = [
        ('icon_16x16.png', 16),
        ('icon_16x16@2x.png', 32),
        ('icon_32x32.png', 32),
        ('icon_32x32@2x.png', 64),
        ('icon_128x128.png', 128),
        ('icon_128x128@2x.png', 256),
        ('icon_256x256.png', 256),
        ('icon_256x256@2x.png', 512),
        ('icon_512x512.png', 512),
        ('icon_512x512@2x.png', 1024),
    ]

    for filename, size in iconset_files:
        png_data = svg_to_png(size)
        path = os.path.join(temp_dir, filename)
        with open(path, 'wb') as f:
            f.write(png_data)
        print(f'Generated {filename} ({size}x{size})')

    # 使用 macOS iconutil 工具生成 icns
    icns_path = os.path.join(ICONS_DIR, 'icon.icns')
    result = subprocess.run(['iconutil', '-c', 'icns', temp_dir, '-o', icns_path],
                            capture_output=True, text=True)
    if result.returncode == 0:
        print('Generated icon.icns')
    else:
        print(f'iconutil error: {result.stderr}')

    # 清理临时目录
    shutil.rmtree(temp_dir)
    print('Cleaned up temp files')


def main():
    print(f'Source: {SVG_PATH}')
    print(f'Output: {ICONS_DIR}')
    print()

    generate_pngs()
    generate_ico()
    generate_icns()

    print()
    print('Done! All icons generated.')


if __name__ == '__main__':
    main()