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
      zoom: 1.0
    };
    
    this.init();
  }

  init() {
    this.bindEvents();
    this.loadSettings();
    this.applySettings();
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
    document.getElementById('btnCloseSidebar').addEventListener('click', () => this.toggleSidebar());

    // Zoom
    document.getElementById('btnZoomIn').addEventListener('click', () => this.adjustZoom(0.1));
    document.getElementById('btnZoomOut').addEventListener('click', () => this.adjustZoom(-0.1));

    // Theme
    document.getElementById('btnTheme').addEventListener('click', () => this.toggleTheme());

    // Font size
    document.getElementById('fontSizeSlider').addEventListener('input', (e) => {
      this.settings.fontSize = parseInt(e.target.value);
      this.saveSettings();
      this.applyFontSize();
    });

    // Drag and drop
    const contentArea = document.getElementById('contentArea');
    contentArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      document.querySelector('.drag-overlay')?.classList.add('active');
    });

    contentArea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      document.querySelector('.drag-overlay')?.classList.remove('active');
    });

    contentArea.addEventListener('drop', (e) => {
      e.preventDefault();
      document.querySelector('.drag-overlay')?.classList.remove('active');
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
        document.getElementById('sidebar').classList.remove('open');
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
    const ul = document.createElement('ul');
    
    this.toc.forEach((item, index) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = item.label;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigateToChapter(item.src);
        this.toggleSidebar();
      });
      li.appendChild(a);
      ul.appendChild(li);
    });
    
    tocContent.innerHTML = '';
    tocContent.appendChild(ul);
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
      
      // Create a blob URL for the content
      const blob = new Blob([content], { type: 'application/xhtml+xml' });
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
    sidebar.classList.toggle('open');
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
    
    // Update font size slider
    document.getElementById('fontSizeSlider').value = this.settings.fontSize;
    
    // Update theme button
    document.getElementById('btnTheme').textContent = this.settings.theme === 'light' ? '🌙' : '☀️';
  }
}

// Initialize reader when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.reader = new EpubReader();
});
