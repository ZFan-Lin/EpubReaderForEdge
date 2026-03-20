// Epub Reader for Edge - Main Reader Script
// Inspired by Calibre's EPUB viewer

class EpubReader {
  constructor() {
    this.zip = null;
    this.epubData = {};
    this.currentChapterIndex = 0;
    this.chapters = [];
    this.toc = [];
    this.settings = {
      fontSize: 16,
      theme: 'light',
      zoom: 1.0,
      tocFontSize: 14,
      language: 'en'
    };
    
    this.uiText = {
      en: {
        open: '📂 Open',
        toc: '📑 TOC',
        prev: '◀ Prev',
        next: 'Next ▶',
        zoomIn: '🔍+',
        zoomOut: '🔍-',
        theme: '🌙',
        settings: '⚙️',
        tocTitle: 'Table of Contents',
        welcomeTitle: 'Welcome to Epub Reader for Edge',
        welcomeText: 'Click "Open" to load an EPUB file, or drag and drop an EPUB file here.',
        settingsTitle: 'Settings',
        tocFontSizeLabel: 'TOC Font Size:',
        languageLabel: 'Language:',
        languageButton: '中文 / English'
      },
      zh: {
        open: '📂 打开',
        toc: '📑 目录',
        prev: '◀ 上一页',
        next: '下一页 ▶',
        zoomIn: '🔍+',
        zoomOut: '🔍-',
        theme: '🌙',
        settings: '⚙️',
        tocTitle: '目录',
        welcomeTitle: '欢迎使用 Edge EPUB 阅读器',
        welcomeText: '点击"打开"加载 EPUB 文件，或将 EPUB 文件拖放到此处。',
        settingsTitle: '设置',
        tocFontSizeLabel: '目录字体大小:',
        languageLabel: '语言:',
        languageButton: '中文 / English'
      }
    };
    
    this.init();
  }

  init() {
    this.bindEvents();
    this.loadSettings();
    this.applySettings();
    this.updateUILanguage();
  }

  bindEvents() {
    // File input
    document.getElementById('btnOpen').addEventListener('click', () => {
      document.getElementById('fileInput').click();
    });
    
    document.getElementById('fileInput').addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.loadEpub(e.target.files[0]);
      }
    });

    // Navigation
    document.getElementById('btnPrev').addEventListener('click', () => this.prevChapter());
    document.getElementById('btnNext').addEventListener('click', () => this.nextChapter());
    
    // TOC
    document.getElementById('btnToc').addEventListener('click', () => this.toggleSidebar());

    // Zoom
    document.getElementById('btnZoomIn').addEventListener('click', () => this.adjustZoom(0.1));
    document.getElementById('btnZoomOut').addEventListener('click', () => this.adjustZoom(-0.1));

    // Theme
    document.getElementById('btnTheme').addEventListener('click', () => this.toggleTheme());

    // Font size
    document.getElementById('fontSizeSlider').addEventListener('input', (e) => {
      this.settings.fontSize = parseInt(e.target.value);
      document.getElementById('fontSizeValue').textContent = this.settings.fontSize + 'px';
      this.saveSettings();
      this.applyFontSize();
    });

    // Settings
    document.getElementById('btnSettings').addEventListener('click', () => this.openSettings());
    document.getElementById('btnCloseSettings').addEventListener('click', () => this.closeSettings());
    
    // TOC Font Size
    document.getElementById('tocFontSizeSlider').addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      document.getElementById('tocFontSizeValue').textContent = value + 'px';
      this.settings.tocFontSize = value;
      this.saveSettings();
      this.applyTocFontSize();
    });
    
    // Language Toggle
    document.getElementById('btnToggleLanguage').addEventListener('click', () => {
      this.settings.language = this.settings.language === 'en' ? 'zh' : 'en';
      this.saveSettings();
      this.updateUILanguage();
      // Re-apply language to settings modal if it's open
      const settingsModal = document.getElementById('settingsModal');
      if (settingsModal.classList.contains('active')) {
        this.updateUILanguage();
      }
    });

    // Drag and drop
    const contentArea = document.getElementById('contentArea');
    const dragOverlay = document.getElementById('dragOverlay');
    
    contentArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (dragOverlay) dragOverlay.classList.add('active');
    });

    contentArea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      if (dragOverlay) dragOverlay.classList.remove('active');
    });

    contentArea.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragOverlay) dragOverlay.classList.remove('active');
      if (e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.name.endsWith('.epub')) {
          this.loadEpub(file);
        } else {
          alert('Please drop an EPUB file');
        }
      }
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        this.prevChapter();
      } else if (e.key === 'ArrowRight') {
        this.nextChapter();
      } else if (e.key === 'Escape') {
        const sidebar = document.getElementById('sidebar');
        const btnToc = document.getElementById('btnToc');
        
        // Close sidebar if open
        if (sidebar.classList.contains('open')) {
          sidebar.classList.remove('open');
          btnToc.classList.remove('active');
        } else {
          // Also close settings modal if open
          this.closeSettings();
        }
      }
    });
    
    // Close settings modal when clicking overlay
    document.getElementById('settingsModal').addEventListener('click', (e) => {
      if (e.target.id === 'settingsModal') {
        this.closeSettings();
      }
    });
  }

  async loadEpub(file) {
    try {
      // Show loading state
      document.getElementById('welcomeMessage').innerHTML = '<p>Loading EPUB...</p>';
      
      // Read file as array buffer
      const arrayBuffer = await file.arrayBuffer();
      
      // Load JSZip (must be included)
      if (typeof JSZip === 'undefined') {
        throw new Error('JSZip library not loaded');
      }
      
      this.zip = await JSZip.loadAsync(arrayBuffer);
      
      // Parse EPUB structure
      await this.parseEpub();
      
      // Hide welcome message, show viewer
      document.getElementById('welcomeMessage').style.display = 'none';
      document.getElementById('viewerFrame').style.display = 'block';
      
      // Load first chapter
      if (this.chapters.length > 0) {
        this.loadChapter(0);
      }
      
      // Update page info
      this.updatePageInfo();
      
    } catch (error) {
      console.error('Error loading EPUB:', error);
      alert('Error loading EPUB: ' + error.message);
      document.getElementById('welcomeMessage').style.display = 'flex';
      document.getElementById('welcomeMessage').innerHTML = `
        <h1>Error Loading EPUB</h1>
        <p>${error.message}</p>
        <p>Click "Open" to try another file.</p>
      `;
    }
  }

  async parseEpub() {
    // Find container.xml
    const containerXml = await this.zip.file('META-INF/container.xml').async('text');
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, 'text/xml');
    
    // Get path to content.opf
    const rootfilePath = containerDoc.querySelector('rootfile').getAttribute('full-path');
    const basePath = rootfilePath.substring(0, rootfilePath.lastIndexOf('/') + 1);
    
    // Parse content.opf
    const opfContent = await this.zip.file(rootfilePath).async('text');
    const opfDoc = parser.parseFromString(opfContent, 'text/xml');
    
    // Extract manifest items
    const manifestItems = {};
    opfDoc.querySelectorAll('manifest item').forEach(item => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      const mediaType = item.getAttribute('media-type');
      manifestItems[id] = { href, mediaType };
    });
    
    // Extract spine (reading order)
    this.chapters = [];
    opfDoc.querySelectorAll('spine itemref').forEach(itemref => {
      const idref = itemref.getAttribute('idref');
      if (manifestItems[idref] && manifestItems[idref].mediaType === 'application/xhtml+xml') {
        this.chapters.push({
          id: idref,
          href: basePath + manifestItems[idref].href
        });
      }
    });
    
    // Extract TOC (from NCX or NAV)
    await this.extractToc(opfDoc, basePath);
  }

  async extractToc(opfDoc, basePath) {
    // Try to find NCX TOC first
    const ncxItem = Array.from(opfDoc.querySelectorAll('manifest item'))
      .find(item => item.getAttribute('media-type') === 'application/x-dtbncx+xml');
    
    if (ncxItem) {
      const ncxPath = basePath + ncxItem.getAttribute('href');
      try {
        const ncxContent = await this.zip.file(ncxPath).async('text');
        const parser = new DOMParser();
        const ncxDoc = parser.parseFromString(ncxContent, 'text/xml');
        
        this.toc = [];
        ncxDoc.querySelectorAll('navMap navPoint').forEach(navPoint => {
          const label = navPoint.querySelector('navLabel text')?.textContent || 'Untitled';
          const src = navPoint.querySelector('content')?.getAttribute('src');
          if (src) {
            this.toc.push({ label, src: basePath + src });
          }
        });
      } catch (e) {
        console.warn('Could not parse NCX:', e);
      }
    }
    
    // If no NCX, use chapters as TOC
    if (this.toc.length === 0) {
      this.toc = this.chapters.map((chapter, index) => ({
        label: `Chapter ${index + 1}`,
        src: chapter.href
      }));
    }
    
    this.renderToc();
  }

  renderToc() {
    const tocContent = document.getElementById('tocContent');
    
    // Remove ul styling since we removed the CSS for it
    tocContent.innerHTML = '';
    
    this.toc.forEach((item, index) => {
      const div = document.createElement('div');
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = item.label;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigateToChapter(item.src);
        // Sidebar stays open when pinned, no need to toggle
      });
      div.appendChild(a);
      tocContent.appendChild(div);
    });
    
    // Apply current TOC font size
    this.applyTocFontSize();
  }

  navigateToChapter(href) {
    const chapterIndex = this.chapters.findIndex(ch => ch.href === href);
    if (chapterIndex !== -1) {
      this.loadChapter(chapterIndex);
    }
  }

  async loadChapter(index) {
    if (index < 0 || index >= this.chapters.length) return;
    
    this.currentChapterIndex = index;
    const chapter = this.chapters[index];
    
    try {
      const content = await this.zip.file(chapter.href).async('text');
      
      // Get the base path for resolving relative image URLs
      const chapterBasePath = chapter.href.substring(0, chapter.href.lastIndexOf('/') + 1);
      
      // Parse the XHTML content to resolve relative image paths
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'application/xhtml+xml');
      
      // Fix image src paths - need to extract images from zip and create blob URLs
      const images = doc.querySelectorAll('img');
      for (const img of images) {
        let src = img.getAttribute('src');
        if (src && !src.startsWith('data:') && !src.startsWith('http://') && !src.startsWith('https://')) {
          // Resolve relative path
          const fullPath = chapterBasePath + src;
          try {
            // Extract image from zip and create blob URL
            const imgFile = this.zip.file(fullPath);
            if (imgFile) {
              const imgBlob = await imgFile.async('blob');
              const imgUrl = URL.createObjectURL(imgBlob);
              img.setAttribute('src', imgUrl);
            }
          } catch (e) {
            console.warn('Could not load image:', fullPath, e);
          }
        }
      }
      
      // Also handle SVG images in manifest
      const svgImages = doc.querySelectorAll('image');
      for (const svgImg of svgImages) {
        let href = svgImg.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || svgImg.getAttribute('href');
        if (href && !href.startsWith('data:') && !href.startsWith('http://') && !href.startsWith('https://')) {
          const fullPath = chapterBasePath + href;
          try {
            const imgFile = this.zip.file(fullPath);
            if (imgFile) {
              const imgBlob = await imgFile.async('blob');
              const imgUrl = URL.createObjectURL(imgBlob);
              svgImg.setAttributeNS('http://www.w3.org/1999/xlink', 'href', imgUrl);
            }
          } catch (e) {
            console.warn('Could not load SVG image:', fullPath, e);
          }
        }
      }
      
      // Add CSS styles to preserve image aspect ratio
      const styleElement = doc.createElement('style');
      styleElement.textContent = `
        img {
          max-width: 100% !important;
          height: auto !important;
          object-fit: contain !important;
        }
        image {
          max-width: 100% !important;
          height: auto !important;
        }
        /* Cover page specific styles */
        .cover-page, [class*="cover"] {
          text-align: center;
        }
        .cover-page img, [class*="cover"] img {
          max-height: 90vh;
          max-width: 100%;
          object-fit: contain;
          display: block;
          margin: 0 auto;
        }
      `;
      if (doc.head) {
        doc.head.appendChild(styleElement);
      } else {
        const head = doc.createElement('head');
        head.appendChild(styleElement);
        doc.documentElement.insertBefore(head, doc.body);
      }
      
      // Serialize back to string
      const serializer = new XMLSerializer();
      const modifiedContent = serializer.serializeToString(doc);
      
      // Create a blob URL for the content
      const blob = new Blob([modifiedContent], { type: 'application/xhtml+xml' });
      const url = URL.createObjectURL(blob);
      
      // Load into iframe
      const frame = document.getElementById('viewerFrame');
      frame.src = url;
      
      // Apply settings after load
      frame.onload = () => {
        this.applyStylesToFrame(frame);
      };
      
      this.updatePageInfo();
    } catch (error) {
      console.error('Error loading chapter:', error);
      alert('Error loading chapter: ' + error.message);
    }
  }

  applyStylesToFrame(frame) {
    try {
      const doc = frame.contentDocument || frame.contentWindow.document;
      
      // Apply font size
      doc.body.style.fontSize = this.settings.fontSize + 'px';
      
      // Apply theme
      if (this.settings.theme === 'dark') {
        doc.body.style.backgroundColor = '#1a1a1a';
        doc.body.style.color = '#ffffff';
      } else {
        doc.body.style.backgroundColor = '#ffffff';
        doc.body.style.color = '#000000';
      }
      
      // Apply zoom
      doc.body.style.zoom = this.settings.zoom;
    } catch (e) {
      console.warn('Could not apply styles to frame:', e);
    }
  }

  prevChapter() {
    if (this.currentChapterIndex > 0) {
      this.loadChapter(this.currentChapterIndex - 1);
    }
  }

  nextChapter() {
    if (this.currentChapterIndex < this.chapters.length - 1) {
      this.loadChapter(this.currentChapterIndex + 1);
    }
  }

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const btnToc = document.getElementById('btnToc');
    
    // Toggle open state
    sidebar.classList.toggle('open');
    btnToc.classList.toggle('active');
  }

  openSettings() {
    const modal = document.getElementById('settingsModal');
    const tocFontSizeSlider = document.getElementById('tocFontSizeSlider');
    
    // Set current TOC font size value
    tocFontSizeSlider.value = this.settings.tocFontSize;
    document.getElementById('tocFontSizeValue').textContent = this.settings.tocFontSize + 'px';
    
    // Apply current language to settings modal
    this.updateUILanguage();
    
    modal.classList.add('active');
  }

  closeSettings() {
    const modal = document.getElementById('settingsModal');
    modal.classList.remove('active');
  }

  applyTocFontSize() {
    const tocContent = document.getElementById('tocContent');
    tocContent.style.fontSize = this.settings.tocFontSize + 'px';
  }

  updateUILanguage() {
    const lang = this.settings.language;
    const text = this.uiText[lang];
    
    // Update toolbar buttons
    document.getElementById('btnOpen').textContent = text.open;
    document.getElementById('btnToc').textContent = text.toc;
    document.getElementById('btnPrev').textContent = text.prev;
    document.getElementById('btnNext').textContent = text.next;
    document.getElementById('btnZoomIn').textContent = text.zoomIn;
    document.getElementById('btnZoomOut').textContent = text.zoomOut;
    document.getElementById('btnTheme').textContent = text.theme;
    document.getElementById('btnSettings').textContent = text.settings;
    
    // Update sidebar title
    document.getElementById('tocTitle').textContent = text.tocTitle;
    
    // Update welcome message
    document.querySelector('#welcomeMessage h1').textContent = text.welcomeTitle;
    document.querySelector('#welcomeMessage p').textContent = text.welcomeText;
    
    // Update settings modal
    document.getElementById('settingsTitle').textContent = text.settingsTitle;
    document.getElementById('tocFontSizeLabel').textContent = text.tocFontSizeLabel;
    document.getElementById('languageLabel').textContent = text.languageLabel;
    document.getElementById('btnToggleLanguage').textContent = text.languageButton;
    
    // Update drag overlay
    const dragText = lang === 'en' ? 'Drop EPUB file here' : '将 EPUB 文件拖放到此处';
    document.getElementById('dragOverlay').textContent = dragText;
  }

  adjustZoom(delta) {
    this.settings.zoom = Math.max(0.5, Math.min(2.0, this.settings.zoom + delta));
    this.saveSettings();
    
    const frame = document.getElementById('viewerFrame');
    this.applyStylesToFrame(frame);
  }

  toggleTheme() {
    this.settings.theme = this.settings.theme === 'light' ? 'dark' : 'light';
    this.saveSettings();
    this.applySettings();
    
    // Update theme button icon
    const btn = document.getElementById('btnTheme');
    btn.textContent = this.settings.theme === 'light' ? '🌙' : '☀️';
    
    // Apply to current frame
    const frame = document.getElementById('viewerFrame');
    this.applyStylesToFrame(frame);
  }

  applyFontSize() {
    const frame = document.getElementById('viewerFrame');
    this.applyStylesToFrame(frame);
    document.getElementById('fontSizeValue').textContent = this.settings.fontSize + 'px';
  }

  updatePageInfo() {
    const pageInfo = document.getElementById('pageInfo');
    if (this.chapters.length > 0) {
      pageInfo.textContent = `${this.currentChapterIndex + 1} / ${this.chapters.length}`;
    } else {
      pageInfo.textContent = '';
    }
  }

  saveSettings() {
    localStorage.setItem('epubReaderSettings', JSON.stringify(this.settings));
  }

  loadSettings() {
    const saved = localStorage.getItem('epubReaderSettings');
    if (saved) {
      try {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      } catch (e) {
        console.warn('Could not load settings:', e);
      }
    }
  }

  applySettings() {
    // Apply theme to main document
    if (this.settings.theme === 'dark') {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
    
    // Update font size slider and display
    document.getElementById('fontSizeSlider').value = this.settings.fontSize;
    document.getElementById('fontSizeValue').textContent = this.settings.fontSize + 'px';
    
    // Update TOC font size slider
    const tocFontSizeSlider = document.getElementById('tocFontSizeSlider');
    if (tocFontSizeSlider) {
      tocFontSizeSlider.value = this.settings.tocFontSize;
      document.getElementById('tocFontSizeValue').textContent = this.settings.tocFontSize + 'px';
    }
    
    // Update theme button
    document.getElementById('btnTheme').textContent = this.settings.theme === 'light' ? '🌙' : '☀️';
    
    // Apply TOC font size
    this.applyTocFontSize();
  }
}

// Initialize reader when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.reader = new EpubReader();
});
