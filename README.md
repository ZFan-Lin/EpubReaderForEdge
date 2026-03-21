# Citron Reader for Edge

一个受 Calibre 阅读器启发的 Microsoft Edge EPUB 阅读插件。
大量使用ai实现功能，但是我也熬了一个通宵。

<img width="200" height="200" alt="200" src="https://github.com/user-attachments/assets/ecd56a40-7575-4f3f-b150-e887379e6a77" />
## 功能特性

- 📖 **EPUB 阅读** - 支持打开和阅读标准 EPUB 格式电子书
- 📑 **目录导航** - 自动提取并显示书籍目录，支持快速跳转
- 🌙 **夜间模式** - 支持亮色/暗色主题切换
- 🔍 **缩放控制** - 自由调整页面缩放比例 (50%-200%)
- 📝 **字体大小** - 可调节字体大小 (12px-32px)
- ⌨️ **键盘导航** - 支持左右方向键翻页
- 💾 **设置保存** - 自动保存阅读偏好设置
- 🖱️ **拖拽支持** - 支持拖拽 EPUB 文件到阅读器打开
- 🐱‍👤**记忆支持** - 支持记录阅读进度，下次打开自动跳转

## 安装方法

### 方法一：开发者模式安装

1. 下载或克隆本仓库
2. 打开 Microsoft Edge 浏览器
3. 访问 `edge://extensions/`
4. 开启右上角的 **"开发者模式"**
5. 点击 **"加载解压缩的扩展"**
6. 选择本项目的根目录
7. 扩展将出现在扩展列表中

### 方法二：打包安装

1. 访问 `edge://extensions/`
2. 点击 **"打包扩展"**
3. 选择本项目的根目录
4. 生成的 `.crx` 文件可直接拖入浏览器安装

## 使用方法

1. 点击浏览器工具栏中的扩展图标
2. 点击 **"Open Reader"** 按钮打开阅读器
3. 点击 **"📂 Open"** 按钮选择 EPUB 文件
4. 或者直接拖拽 EPUB 文件到阅读器区域

### 快捷键

- **← 左箭头**: 上一章
- **→ 右箭头**: 下一章
- **Esc**: 关闭目录侧边栏

## 项目结构

```
CitronReader/
├── manifest.json          # 扩展配置文件
├── src/
│   ├── reader.html        # 阅读器主页面
│   ├── reader.css         # 阅读器样式
│   ├── reader.js          # 阅读器核心逻辑
│   ├── popup.html         # 扩展弹窗页面
│   ├── popup.js           # 弹窗脚本
│   └── background.js      # 后台服务脚本
├── lib/
│   └── jszip.min.js       # JSZip 库 (用于解析 EPUB)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 技术实现

- **Manifest V3**: 使用最新的扩展 API 规范
- **JSZip**: 用于解压和读取 EPUB 文件内容
- **原生 JavaScript**: 无需额外框架，轻量高效
- **DOMParser**: 解析 EPUB 内部的 XML 文件 (container.xml, content.opf, NCX)

## 兼容的 EPUB 特性

- ✅ EPUB 2.x 和 EPUB 3.x
- ✅ NCX 目录和 NAV 目录
- ✅ XHTML 内容文档
- ✅ CSS 样式（基础支持）
- ✅ 图片资源

## 注意事项

- 本扩展目前主要在本地运行，不支持 DRM 保护的 EPUB 文件
- 某些复杂的 EPUB 3 特性可能不完全支持
- 建议在 Edge 浏览器最新版本上使用

## 开发说明

### 调试

1. 在 `edge://extensions/` 中找到本扩展
2. 点击 **"检查视图 - service worker"** 查看后台日志
3. 打开阅读器后，按 F12 打开开发者工具调试页面

### 构建

本项目无需构建步骤，修改代码后重新加载扩展即可生效。

## 许可证

MIT License

## 致谢
Qwen ai 本插件使用千问ai制作。
灵感来源于 [Calibre](https://calibre-ebook.com/) 的 EPUB 阅读器。
