// Citron Reader - Main Reader Script
// Inspired by Calibre's EPUB viewer

class CitronReader {
  constructor() {
    this.zip = null;
    this.epubData = {};
    this.currentChapterIndex = 0;
    this.chapters = [];
    this.toc = [];
    this.currentBookKey = null;
    this.pendingLocation = null;
    this.pendingChapterIndex = null;
    this.settings = {
      fontSize: 16,
      theme: 'light',
      zoom: 1.0,
      tocFontSize: 14,
      language: 'en'
    };
    
    this.HISTORY_KEY = 'citron_reader_history';
    
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
        welcomeTitle: 'Welcome to Citron Reader',
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
        welcomeTitle: '欢迎使用 Citron Reader',
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
    
    // Open TOC sidebar by default
    const sidebar = document.getElementById('sidebar');
    const btnToc = document.getElementById('btnToc');
    // Sidebar is open by default (no 'closed' class)
    btnToc.classList.add('active');
    btnToc.textContent = '❌ Close';
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

    // Font Size button - opens font size modal (removed - using toolbar button now)
    
    // Settings - toggle dropdown panel
    document.getElementById('btnSettings').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSettingsDropdown();
    });
    
    // TOC Font Size slider in dropdown
    document.getElementById('tocFontSizeSliderDropdown').addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      const tocFontSizeValueDropdown = document.getElementById('tocFontSizeValueDropdown');
      if (tocFontSizeValueDropdown) {
        tocFontSizeValueDropdown.textContent = value + 'px';
      }
      this.settings.tocFontSize = value;
      this.saveSettings();
      this.applyTocFontSize();
    });
    
    // Main Font Size slider in dropdown
    document.getElementById('mainFontSizeSliderDropdown').addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      const mainFontSizeValueDropdown = document.getElementById('mainFontSizeValueDropdown');
      if (mainFontSizeValueDropdown) {
        mainFontSizeValueDropdown.textContent = value + 'px';
      }
      this.settings.fontSize = value;
      this.saveSettings();
      this.applyFontSize();
    });
    
    // Language Toggle in dropdown
    document.getElementById('btnToggleLanguageDropdown').addEventListener('click', () => {
      this.settings.language = this.settings.language === 'en' ? 'zh' : 'en';
      this.saveSettings();
      this.updateUILanguage();
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('settingsDropdown');
      const btnSettings = document.getElementById('btnSettings');
      if (dropdown && dropdown.classList.contains('active') && 
          !dropdown.contains(e.target) && !btnSettings.contains(e.target)) {
        this.closeSettingsDropdown();
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
        
        // Close sidebar if open (not closed)
        if (!sidebar.classList.contains('closed')) {
          sidebar.classList.add('closed');
          btnToc.classList.remove('active');
          btnToc.textContent = '📑 TOC';
        } else {
          // Also close settings dropdown if open
          this.closeSettingsDropdown();
        }
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
      
      // Generate book key from filename
      this.currentBookKey = 'book_' + file.name.replace(/[^a-zA-Z0-9]/g, '_');
      
      // Parse EPUB structure
      await this.parseEpub();
      
      // Hide welcome message, show viewer
      document.getElementById('welcomeMessage').style.display = 'none';
      document.getElementById('viewerFrame').style.display = 'block';
      
      // Load first chapter or restore last position
      if (this.chapters.length > 0) {
        const lastLocation = this.getBookProgress(this.currentBookKey);
        if (lastLocation && lastLocation.location !== undefined) {
          // We'll restore position after chapter loads
          this.pendingLocation = lastLocation.location;
          this.pendingChapterIndex = lastLocation.chapterIndex || 0;
          console.log('Restoring reading position:', this.pendingLocation, 'chapter:', this.pendingChapterIndex);
          this.loadChapter(this.pendingChapterIndex);
        } else {
          this.loadChapter(0);
        }
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
        const navPoints = ncxDoc.querySelectorAll('navMap navPoint');
        navPoints.forEach(navPoint => {
          try {
            const labelElement = navPoint.querySelector('navLabel text');
            const label = labelElement ? labelElement.textContent || 'Untitled' : 'Untitled';
            const contentElement = navPoint.querySelector('content');
            const src = contentElement ? contentElement.getAttribute('src') : null;
            if (src) {
              this.toc.push({ label, src: basePath + src });
            }
          } catch (e) {
            console.warn('Error parsing a navPoint:', e);
          }
        });
      } catch (e) {
        console.warn('Could not parse NCX:', e);
      }
    }
    
    // If no NCX or NCX parsing failed, try EPUB3 NAV document
    if (this.toc.length === 0) {
      const navItem = Array.from(opfDoc.querySelectorAll('manifest item'))
        .find(item => item.getAttribute('media-type') === 'application/xhtml+xml' && 
                      item.getAttribute('properties')?.includes('nav'));
      
      if (navItem) {
        const navPath = basePath + navItem.getAttribute('href');
        try {
          const navContent = await this.zip.file(navPath).async('text');
          const parser = new DOMParser();
          const navDoc = parser.parseFromString(navContent, 'application/xhtml+xml');
          
          this.toc = [];
          const navLinks = navDoc.querySelectorAll('nav[epub\\:type="toc"] li a, nav[type="toc"] li a');
          navLinks.forEach(link => {
            try {
              const label = link.textContent?.trim() || 'Untitled';
              const href = link.getAttribute('href');
              if (href) {
                // Resolve relative href if needed
                const resolvedHref = href.startsWith('http') ? href : basePath + href;
                this.toc.push({ label, src: resolvedHref });
              }
            } catch (e) {
              console.warn('Error parsing a NAV link:', e);
            }
          });
        } catch (e) {
          console.warn('Could not parse NAV document:', e);
        }
      }
    }
    
    // If still no TOC, use chapters as TOC
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
    // Find the chapter index first
    const chapterIndex = this.chapters.findIndex(ch => ch.href === href);
    if (chapterIndex !== -1) {
      // Save current position before navigating (only if we have a valid document)
      const frame = document.getElementById('viewerFrame');
      if (frame && frame.contentDocument && frame.contentDocument.body && 
          frame.contentDocument.body.scrollHeight > 0 && this.currentBookKey) {
        const location = this.getCurrentLocation(frame);
        this.saveBookProgress(this.currentBookKey, location);
      }
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
      
      // Handle audio elements
      const audioElements = doc.querySelectorAll('audio');
      for (const audio of audioElements) {
        let src = audio.getAttribute('src');
        if (src && !src.startsWith('data:') && !src.startsWith('http://') && !src.startsWith('https://')) {
          const fullPath = chapterBasePath + src;
          try {
            const audioFile = this.zip.file(fullPath);
            if (audioFile) {
              const audioBlob = await audioFile.async('blob');
              const audioUrl = URL.createObjectURL(audioBlob);
              audio.setAttribute('src', audioUrl);
            }
          } catch (e) {
            console.warn('Could not load audio:', fullPath, e);
          }
        }
        // Also handle source elements inside audio
        const sources = audio.querySelectorAll('source');
        for (const source of sources) {
          let src = source.getAttribute('src');
          if (src && !src.startsWith('data:') && !src.startsWith('http://') && !src.startsWith('https://')) {
            const fullPath = chapterBasePath + src;
            try {
              const audioFile = this.zip.file(fullPath);
              if (audioFile) {
                const audioBlob = await audioFile.async('blob');
                const audioUrl = URL.createObjectURL(audioBlob);
                source.setAttribute('src', audioUrl);
              }
            } catch (e) {
              console.warn('Could not load audio source:', fullPath, e);
            }
          }
        }
      }
      
      // Handle video elements
      const videoElements = doc.querySelectorAll('video');
      for (const video of videoElements) {
        let src = video.getAttribute('src');
        if (src && !src.startsWith('data:') && !src.startsWith('http://') && !src.startsWith('https://')) {
          const fullPath = chapterBasePath + src;
          try {
            const videoFile = this.zip.file(fullPath);
            if (videoFile) {
              const videoBlob = await videoFile.async('blob');
              const videoUrl = URL.createObjectURL(videoBlob);
              video.setAttribute('src', videoUrl);
            }
          } catch (e) {
            console.warn('Could not load video:', fullPath, e);
          }
        }
        // Also handle source elements inside video
        const sources = video.querySelectorAll('source');
        for (const source of sources) {
          let src = source.getAttribute('src');
          if (src && !src.startsWith('data:') && !src.startsWith('http://') && !src.startsWith('https://')) {
            const fullPath = chapterBasePath + src;
            try {
              const videoFile = this.zip.file(fullPath);
              if (videoFile) {
                const videoBlob = await videoFile.async('blob');
                const videoUrl = URL.createObjectURL(videoBlob);
                source.setAttribute('src', videoUrl);
              }
            } catch (e) {
              console.warn('Could not load video source:', fullPath, e);
            }
          }
        }
      }
      
      // Add CSS styles to preserve image aspect ratio and media controls
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
        /* Media elements (audio/video) styling */
        audio, video {
          max-width: 100% !important;
          display: block;
          margin: 1em auto;
        }
        video {
          max-height: 80vh !important;
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
      frame.style.pointerEvents = 'auto';  // Re-enable pointer events for the iframe content
      frame.src = url;
      
      // Apply settings after load and restore position if needed
      frame.onload = () => {
        this.applyStylesToFrame(frame);
        
        // Restore last reading position if exists
        if (this.pendingLocation !== null && this.pendingLocation !== undefined) {
          try {
            console.log('=== Starting Position Restoration ===');
            console.log('Pending location:', this.pendingLocation, 'type:', typeof this.pendingLocation);
            
            const doc = frame.contentDocument;
            const body = doc.body;
            const docElement = doc.documentElement;
            
            // Normalize pendingLocation to new format { type, value }
            let locationObj = { type: 'percent', value: 0 }; // Default fallback
            
            if (typeof this.pendingLocation === 'object' && this.pendingLocation !== null && this.pendingLocation.type) {
              // New format
              locationObj = this.pendingLocation;
            } else if (this.pendingLocation !== null && this.pendingLocation !== undefined) {
              // Old format (string or number) - treat as percentage
              const percentValue = parseFloat(this.pendingLocation);
              if (!isNaN(percentValue)) {
                locationObj = { type: 'percent', value: percentValue };
              } else {
                // Try as ID
                locationObj = { type: 'id', value: String(this.pendingLocation) };
              }
            }
            
            console.log('Normalized location:', locationObj);
            
            // Use requestAnimationFrame to ensure DOM is fully rendered
            const restorePosition = (attemptCount) => {
              const currentAttempt = attemptCount || 1;
              
              // Get scroll metrics
              const viewportHeight = frame.clientHeight || window.innerHeight;
              const bodyScrollHeight = body.scrollHeight || 0;
              const docElementScrollHeight = docElement.scrollHeight || 0;
              const scrollHeight = Math.max(bodyScrollHeight, docElementScrollHeight) - viewportHeight;
              
              console.log(`Restore attempt ${currentAttempt}: scrollHeight=${scrollHeight}, viewportHeight=${viewportHeight}`);
              
              if (scrollHeight <= 0) {
                if (currentAttempt < 15) {
                  console.log('Content not ready, retrying...');
                  setTimeout(() => restorePosition(currentAttempt + 1), 80);
                } else {
                  console.warn('Failed: scrollHeight still 0 after', currentAttempt, 'attempts');
                }
                return;
              }
              
              // Restore based on location type
              if (locationObj.type === 'id' && locationObj.value) {
                const targetId = locationObj.value;
                const targetElement = doc.getElementById(targetId);
                if (targetElement) {
                  targetElement.scrollIntoView();
                  console.log('✓ Restored position using anchor ID:', targetId);
                } else {
                  console.warn('Anchor ID not found:', targetId, '- falling back to percentage');
                  // Fall back to percentage if ID not found
                  locationObj.type = 'percent';
                  locationObj.value = 0;
                  restorePosition(1);
                }
              } else if (locationObj.type === 'percent' && typeof locationObj.value === 'number') {
                const percentage = locationObj.value;
                const targetScroll = scrollHeight * percentage;
                console.log('Restoring using percentage:', percentage, 'target:', targetScroll);
                
                body.scrollTop = targetScroll;
                docElement.scrollTop = targetScroll;
                if (doc.defaultView && doc.defaultView.scrollTo) {
                  doc.defaultView.scrollTo(0, targetScroll);
                }
                
                setTimeout(() => {
                  const actualScroll = Math.max(body.scrollTop || 0, docElement.scrollTop || 0);
                  console.log('Verification: expected=', targetScroll, 'actual=', actualScroll);
                }, 200);
              }
            };
            
            setTimeout(() => restorePosition(1), 100);
          } catch (e) {
            console.warn('Could not restore reading position:', e);
          }
          this.pendingLocation = null;
        }
        
        // Setup auto-save on scroll/resize in the iframe
        this.setupAutoSave(frame);
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
      // Save current position before changing chapter
      const frame = document.getElementById('viewerFrame');
      if (frame && frame.contentDocument && this.currentBookKey) {
        const location = this.getCurrentLocation(frame);
        this.saveBookProgress(this.currentBookKey, location);
      }
      this.loadChapter(this.currentChapterIndex - 1);
    }
  }

  nextChapter() {
    if (this.currentChapterIndex < this.chapters.length - 1) {
      // Save current position before changing chapter
      const frame = document.getElementById('viewerFrame');
      if (frame && frame.contentDocument && this.currentBookKey) {
        const location = this.getCurrentLocation(frame);
        this.saveBookProgress(this.currentBookKey, location);
      }
      this.loadChapter(this.currentChapterIndex + 1);
    }
  }

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const btnToc = document.getElementById('btnToc');
    
    // Toggle closed state (default is open)
    sidebar.classList.toggle('closed');
    btnToc.classList.toggle('active');
    
    // Update button icon based on state
    if (sidebar.classList.contains('closed')) {
      btnToc.textContent = '📑 TOC';
    } else {
      btnToc.textContent = '❌ Close';
    }
    
    // Save current position when toggling sidebar
    const frame = document.getElementById('viewerFrame');
    if (frame && frame.contentDocument && this.currentBookKey) {
      const location = this.getCurrentLocation(frame);
      this.saveBookProgress(this.currentBookKey, location);
    }
  }

  toggleSettingsDropdown() {
    const dropdown = document.getElementById('settingsDropdown');
    const tocFontSizeSlider = document.getElementById('tocFontSizeSliderDropdown');
    const mainFontSizeSlider = document.getElementById('mainFontSizeSliderDropdown');
    
    // Toggle visibility
    dropdown.classList.toggle('active');
    
    if (dropdown.classList.contains('active')) {
      // Set current TOC font size value
      tocFontSizeSlider.value = this.settings.tocFontSize;
      const tocFontSizeValueDropdown = document.getElementById('tocFontSizeValueDropdown');
      if (tocFontSizeValueDropdown) {
        tocFontSizeValueDropdown.textContent = this.settings.tocFontSize + 'px';
      }
      
      // Set current main font size value
      mainFontSizeSlider.value = this.settings.fontSize;
      const mainFontSizeValueDropdown = document.getElementById('mainFontSizeValueDropdown');
      if (mainFontSizeValueDropdown) {
        mainFontSizeValueDropdown.textContent = this.settings.fontSize + 'px';
      }
      
      // Apply current language to settings dropdown
      this.updateUILanguage();
    }
  }
  
  closeSettingsDropdown() {
    const dropdown = document.getElementById('settingsDropdown');
    dropdown.classList.remove('active');
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
    
    // Update settings dropdown labels
    document.getElementById('tocFontSizeLabel').textContent = text.tocFontSizeLabel;
    document.getElementById('fontSizeLabel').textContent = lang === 'en' ? 'Font Size:' : '字体大小:';
    document.getElementById('languageLabel').textContent = text.languageLabel;
    document.getElementById('btnToggleLanguageDropdown').textContent = text.languageButton;
    
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
    // Note: fontSizeValue display element was removed from UI
  }

  updatePageInfo() {
    const pageInfo = document.getElementById('pageInfo');
    if (!pageInfo) return; // 元素不存在时直接返回，避免报错
    
    if (this.chapters.length > 0) {
      pageInfo.textContent = `${this.currentChapterIndex + 1} / ${this.chapters.length}`;
    } else {
      pageInfo.textContent = 'N/N';
    }
  }

  saveSettings() {
    localStorage.setItem('citronReaderSettings', JSON.stringify(this.settings));
  }

  loadSettings() {
    const saved = localStorage.getItem('citronReaderSettings');
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
    
    // Update main font size slider in settings dropdown
    const mainFontSizeSlider = document.getElementById('mainFontSizeSliderDropdown');
    if (mainFontSizeSlider) {
      mainFontSizeSlider.value = this.settings.fontSize;
      document.getElementById('mainFontSizeValueDropdown').textContent = this.settings.fontSize + 'px';
    }
    
    // Update TOC font size slider in settings dropdown
    const tocFontSizeSlider = document.getElementById('tocFontSizeSliderDropdown');
    if (tocFontSizeSlider) {
      tocFontSizeSlider.value = this.settings.tocFontSize;
      const tocFontSizeValueDropdown = document.getElementById('tocFontSizeValueDropdown');
      if (tocFontSizeValueDropdown) {
        tocFontSizeValueDropdown.textContent = this.settings.tocFontSize + 'px';
      }
    }
    
    // Update theme button
    const btnTheme = document.getElementById('btnTheme');
    if (btnTheme) {
      btnTheme.textContent = this.settings.theme === 'light' ? '🌙' : '☀️';
    }
    
    // Apply TOC font size
    this.applyTocFontSize();
  }

  // Save book reading progress
  saveBookProgress(key, location) {
    if (!key) return;
    
    try {
      const history = JSON.parse(localStorage.getItem(this.HISTORY_KEY) || '{}');
      history[key] = {
        location: location,
        chapterIndex: this.currentChapterIndex,
        timestamp: Date.now(),
        bookName: key.replace('book_', '').replace(/_/g, ' ')
      };
      localStorage.setItem(this.HISTORY_KEY, JSON.stringify(history));
      console.log('Saved progress for', key, ':', location, 'chapter:', this.currentChapterIndex);
    } catch (e) {
      console.warn('Could not save book progress:', e);
    }
  }

  // Get book reading progress
  getBookProgress(key) {
    if (!key) return null;
    
    try {
      const history = JSON.parse(localStorage.getItem(this.HISTORY_KEY) || '{}');
      return history[key] || null;
    } catch (e) {
      console.warn('Could not get book progress:', e);
      return null;
    }
  }

  // Setup auto-save of reading position
  setupAutoSave(frame) {
    if (!frame) return;
    
    // Debounce function to avoid saving too frequently
    let saveTimeout = null;
    const debouncedSave = () => {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        if (this.currentBookKey) {
          const location = this.getCurrentLocation(frame);
          this.saveBookProgress(this.currentBookKey, location);
        }
      }, 500);
    };
    
    // Listen for scroll events on the iframe element itself
    try {
      frame.addEventListener('scroll', debouncedSave, true);
    } catch (e) {
      console.warn('Could not add scroll listener to iframe:', e);
    }
    
    // Also listen to internal document scroll for compatibility
    if (frame.contentDocument) {
      const doc = frame.contentDocument;
      const body = doc.body;
      
      try {
        doc.addEventListener('scroll', debouncedSave, true);
      } catch (e) {
        console.warn('Could not add scroll listener to document:', e);
      }
      if (body) {
        try {
          body.addEventListener('scroll', debouncedSave, true);
        } catch (e) {
          console.warn('Could not add scroll listener to body:', e);
        }
      }
    }
    
    // Also save when leaving the page or closing tab
    window.addEventListener('beforeunload', () => {
      if (this.currentBookKey) {
        const location = this.getCurrentLocation(frame);
        this.saveBookProgress(this.currentBookKey, location);
      }
    });
    
    // Initial save
    debouncedSave();
  }

  // Get current reading location: Priority 1: Element ID, Priority 2: Percentage
  getCurrentLocation(frame) {
    try {
      if (!frame || !frame.contentDocument || !frame.contentDocument.body) {
        console.warn('getCurrentLocation: Frame or document not ready');
        return null;
      }
      
      const doc = frame.contentDocument;
      const body = doc.body;
      const docElement = doc.documentElement;
      
      // Strategy 1: Find an anchor element (element with id) near the center of viewport
      // This is much more reliable than percentage for EPUBs which have varying content
      const viewportHeight = frame.clientHeight || window.innerHeight;
      const scrollTop = body.scrollTop || docElement.scrollTop || 0;
      const centerY = scrollTop + (viewportHeight / 3); // Look at upper third of visible area
      
      // Get all elements with ID in the body
      const allElements = body.querySelectorAll('*[id]');
      let bestAnchorId = null;
      let minDistance = Infinity;
      
      for (let el of allElements) {
        const rect = el.getBoundingClientRect();
        // Calculate element position relative to document
        const elementTop = rect.top + scrollTop; 
        
        // We want an element that's visible or just above the viewport center
        if (elementTop <= centerY + 50) {
          const distance = Math.abs(elementTop - centerY);
          if (distance < minDistance) {
            minDistance = distance;
            bestAnchorId = el.id;
          }
        }
      }
      
      if (bestAnchorId) {
        console.log('getCurrentLocation: Found anchor ID:', bestAnchorId);
        return { type: 'id', value: bestAnchorId };
      }
      
      // Strategy 2: Fallback to percentage if no good anchor found
      const bodyScrollHeight = body.scrollHeight || 0;
      const docElementScrollHeight = docElement.scrollHeight || 0;
      const scrollHeight = Math.max(bodyScrollHeight, docElementScrollHeight) - viewportHeight;
      
      if (scrollHeight <= 0) {
        console.log('getCurrentLocation: scrollHeight is 0, returning 0');
        return { type: 'percent', value: 0 };
      }
      
      const percentage = scrollTop / scrollHeight;
      console.log('getCurrentLocation: Using percentage:', percentage.toFixed(3));
      return { type: 'percent', value: percentage };
      
    } catch (e) {
      console.warn('getCurrentLocation error:', e);
      return { type: 'percent', value: 0 };
    }
  }
}

// Initialize reader when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.reader = new CitronReader();
});
