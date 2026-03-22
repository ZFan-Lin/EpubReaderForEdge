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
    this.HIGHLIGHTS_KEY = 'citron_reader_highlights';
    this.NOTES_KEY = 'citron_reader_notes';
    this.highlightMode = false;
    this.iframeClickListener = null;
    this.previousViewerFrame = null;
    this.notePopover = null;
    this.currentNoteHighlightId = null;
    
    this.uiText = {
      en: {
        open: '📂 Open',
        toc: '📑 TOC',
        prev: '◀ Prev',
        next: 'Next ▶',
        zoomIn: '🔍+',
        zoomOut: '🔍-',
        highlight: 'Highlight',
        note: '📝 Note',
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
        highlight: '高亮',
        note: '📝 笔记',
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

    // Highlight color picker - click on color option to highlight selected text directly
    const colorPicker = document.getElementById('highlightColorPicker');
    colorPicker.querySelectorAll('.color-option').forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const color = option.dataset.color;
        if (color === 'remove') {
          this.removeHighlightFromSelection();
        } else {
          this.applyHighlightWithColor(color);
        }
        // Close color picker after selection
        this.hideHighlightColorPicker();
      });
    });
    
    // Highlight button - toggle color picker visibility when text is selected
    document.getElementById('btnHighlight').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleHighlightColorPicker();
    });
    
    // Note button - add note to selected text
    document.getElementById('btnNote').addEventListener('click', (e) => {
      e.stopPropagation();
      this.openNoteForSelection();
    });
    
    // Close color picker when clicking outside (but not when clicking on the color picker itself)
    // Also cancel highlight operation if clicking elsewhere without selecting a color
    document.addEventListener('click', (e) => {
      const colorPicker = document.getElementById('highlightColorPicker');
      const btnHighlight = document.getElementById('btnHighlight');
      if (colorPicker && colorPicker.classList.contains('active') && 
          !colorPicker.contains(e.target) && !btnHighlight.contains(e.target)) {
        colorPicker.classList.remove('active');
        // Clear selection in iframe to cancel highlight operation
        const frame = document.getElementById('viewerFrame');
        if (frame && frame.contentDocument) {
          try {
            const selection = frame.contentDocument.getSelection();
            if (selection) {
              selection.removeAllRanges();
            }
          } catch (err) {
            // Ignore errors when clearing selection
          }
        }
      }
    }, { capture: true });

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
    }, { capture: true });

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
      const frame = document.getElementById('viewerFrame');
      frame.style.display = 'block';
      // pointerEvents is now handled by CSS
      
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
      // Keep pointerEvents as 'auto' - CSS now handles this, and we need clicks to work for closing popups
      frame.src = url;
      
      // Apply settings after load and restore position if needed
      frame.onload = () => {
        this.applyStylesToFrame(frame);
        
        // Remove old iframe click listener before adding new one
        const oldFrame = this.previousViewerFrame;
        if (oldFrame && oldFrame.contentDocument && this.iframeClickListener) {
          try {
            oldFrame.contentDocument.removeEventListener('click', this.iframeClickListener, { capture: true });
          } catch (e) {
            // Ignore errors from old frame
          }
        }
        this.previousViewerFrame = frame;
        
        // Add click listener to iframe content to close popups when clicking inside the book
        this.addIframeClickListeners(frame);
        
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
        
        // Load and apply highlights for current chapter
        this.loadAndApplyHighlights();
        
        // Load and apply note indicators
        this.loadAndApplyNoteIndicators();
        
        // Setup click listeners on highlights to show notes
        this.setupHighlightClickListeners(frame);
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
      
      // Inject highlight styles into iframe
      if (!doc.getElementById('citron-highlight-styles')) {
        const styleElement = doc.createElement('style');
        styleElement.id = 'citron-highlight-styles';
        styleElement.textContent = `
          mark.citron-highlight {
            padding: 2px 0;
            border-radius: 2px;
            cursor: pointer;
          }
          mark.citron-highlight.yellow {
            background-color: #ffeb3b !important;
          }
          mark.citron-highlight.blue {
            background-color: #64b5f6 !important;
          }
          mark.citron-highlight.red {
            background-color: #e57373 !important;
          }
          mark.citron-highlight.green {
            background-color: #81c784 !important;
          }
          mark.citron-highlight.purple {
            background-color: #ba68c8 !important;
          }
          mark.citron-highlight.orange {
            background-color: #ffb74d !important;
          }
          body.dark-theme mark.citron-highlight.yellow {
            background-color: #f9a825 !important;
          }
          body.dark-theme mark.citron-highlight.blue {
            background-color: #1976d2 !important;
          }
          body.dark-theme mark.citron-highlight.red {
            background-color: #c62828 !important;
          }
          body.dark-theme mark.citron-highlight.green {
            background-color: #388e3c !important;
          }
          body.dark-theme mark.citron-highlight.purple {
            background-color: #7b1fa2 !important;
          }
          body.dark-theme mark.citron-highlight.orange {
            background-color: #f57c00 !important;
          }
          mark.citron-highlight.has-note {
            border-bottom: 1px solid #4285f4;
            padding-bottom: 0px;
            background-color: transparent !important;
          }
          body.dark-theme mark.citron-highlight.has-note {
            border-bottom: 1px solid #8ab4f8;
            padding-bottom: 0px;
            background-color: transparent !important;
          }
        `;
        if (doc.head) {
          doc.head.appendChild(styleElement);
        }
      }
      
      // Apply font size
      doc.body.style.fontSize = this.settings.fontSize + 'px';
      
      // Apply theme
      if (this.settings.theme === 'dark') {
        doc.body.classList.add('dark-theme');
        doc.body.style.backgroundColor = '#1a1a1a';
        doc.body.style.color = '#ffffff';
      } else {
        doc.body.classList.remove('dark-theme');
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
    document.getElementById('btnHighlight').textContent = text.highlight;
    document.getElementById('btnNote').textContent = text.note;
    document.getElementById('btnTheme').textContent = text.theme;
    document.getElementById('btnSettings').textContent = text.settings;
    
    // Update sidebar title
    document.getElementById('tocTitle').textContent = text.tocTitle;
    
    // Update welcome message (only if element exists)
    const welcomeH1 = document.querySelector('#welcomeMessage h1');
    const welcomeP = document.querySelector('#welcomeMessage p');
    if (welcomeH1) welcomeH1.textContent = text.welcomeTitle;
    if (welcomeP) welcomeP.textContent = text.welcomeText;
    
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

  // Toggle highlight color picker visibility when text is selected
  toggleHighlightColorPicker() {
    const frame = document.getElementById('viewerFrame');
    if (!frame || !frame.contentDocument) return;
    
    const doc = frame.contentDocument;
    const selection = doc.getSelection();
    const selectedText = selection ? selection.toString().trim() : '';
    
    if (!selectedText || !this.currentBookKey) {
      // No text selected, just show a hint or do nothing
      return;
    }
    
    // Toggle color picker visibility
    const colorPicker = document.getElementById('highlightColorPicker');
    colorPicker.classList.toggle('active');
  }

  // Show highlight color picker when text is selected (deprecated - use toggleHighlightColorPicker instead)
  showHighlightColorPicker() {
    console.log('showHighlightColorPicker is deprecated, use toggleHighlightColorPicker instead');
    this.toggleHighlightColorPicker();
  }

  // Apply highlight with selected color
  applyHighlightWithColor(color) {
    const frame = document.getElementById('viewerFrame');
    if (!frame || !frame.contentDocument) return;
    
    const doc = frame.contentDocument;
    const selection = doc.getSelection();
    
    if (!selection || !selection.toString().trim()) {
      // No valid selection
      this.hideHighlightColorPicker();
      return;
    }
    
    // Clone the range before any DOM manipulation
    const originalRange = selection.getRangeAt(0).cloneRange();
    const selectedText = selection.toString().trim();
    
    // Get chapter info
    const chapterIndex = this.currentChapterIndex;
    const chapterHref = this.chapters[chapterIndex]?.href || '';
    
    // Create highlight object with color
    const highlight = {
      id: 'hl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      text: selectedText,
      color: color,
      chapterIndex: chapterIndex,
      chapterHref: chapterHref,
      timestamp: Date.now(),
      startOffset: originalRange.startOffset,
      endOffset: originalRange.endOffset,
      startParentPath: this.getNodePath(originalRange.startContainer),
      endParentPath: this.getNodePath(originalRange.endContainer)
    };
    
    // Save highlight first (before DOM manipulation)
    this.saveHighlight(highlight);
    
    // Apply visual highlight using the cloned range
    const success = this.addHighlightToDOM(originalRange, highlight.id, color);
    
    if (success) {
      // Clear selection only after successful highlight
      selection.removeAllRanges();
      console.log('Highlight saved:', highlight);
    } else {
      // If highlighting failed, remove from storage
      this.deleteHighlightById(highlight.id);
      console.warn('Highlight failed, removed from storage');
    }
    
    // Hide color picker
    this.hideHighlightColorPicker();
  }

  hideHighlightColorPicker() {
    const colorPicker = document.getElementById('highlightColorPicker');
    if (colorPicker) {
      colorPicker.classList.remove('active');
    }
  }

  // Add click listeners to iframe content to close popups when clicking inside the book
  addIframeClickListeners(frame) {
    try {
      const doc = frame.contentDocument || frame.contentWindow.document;
      if (!doc) return;
      
      // Remove any existing listener to avoid duplicates
      if (this.iframeClickListener) {
        doc.removeEventListener('click', this.iframeClickListener, { capture: true });
      }
      
      this.iframeClickListener = (e) => {
        // Close color picker if open - clicking in iframe should close it without clearing selection
        const colorPicker = document.getElementById('highlightColorPicker');
        if (colorPicker && colorPicker.classList.contains('active')) {
          colorPicker.classList.remove('active');
          // Don't clear selection here - let the user's original selection remain
          // The selection will be cleared only after successfully applying a highlight
          return; // Stop processing after closing color picker
        }
        
        // Close note popover if clicking outside of it
        const notePopover = document.querySelector('.note-popover');
        if (notePopover && notePopover.classList.contains('active')) {
          // Check if click is outside the popover and outside any highlight with note
          const highlightEl = e.target.closest('mark.citron-highlight');
          if (!notePopover.contains(e.target) && (!highlightEl || !highlightEl.classList.contains('has-note'))) {
            this.closeNotePopover();
          }
        }
        
        // Close settings dropdown if open and click is not inside dropdown
        const dropdown = document.getElementById('settingsDropdown');
        if (dropdown && dropdown.classList.contains('active')) {
          dropdown.classList.remove('active');
        }
      };
      
      doc.addEventListener('click', this.iframeClickListener, { capture: true });
    } catch (e) {
      console.warn('Could not add iframe click listener:', e);
    }
  }

  // Toggle highlight mode on/off (deprecated - kept for compatibility)
  toggleHighlightMode() {
    console.log('toggleHighlightMode is deprecated, use showHighlightColorPicker instead');
  }

  // Setup listener for text selection in iframe (deprecated)
  setupHighlightSelectionListener() {
    console.log('setupHighlightSelectionListener is deprecated');
  }

  // Remove highlight selection listener (deprecated)
  removeHighlightSelectionListener() {
    console.log('removeHighlightSelectionListener is deprecated');
  }

  // Apply highlight to selected text (deprecated)
  applyHighlight(selection) {
    console.log('applyHighlight is deprecated, use applyHighlightWithColor instead');
  }

  // Get path to node for reliable re-selection
  getNodePath(node) {
    const path = [];
    let current = node;
    
    while (current && current.nodeType !== Node.DOCUMENT_NODE && current.parentElement) {
      let index = 0;
      let sibling = current;
      while (sibling = sibling.previousSibling) {
        if (sibling.nodeType === current.nodeType && sibling.nodeName === current.nodeName) {
          index++;
        }
      }
      
      // If this is a text node, also store its position among text nodes in the parent
      let textNodeIndex = -1;
      if (current.nodeType === Node.TEXT_NODE) {
        textNodeIndex = 0;
        let prevSibling = current.previousSibling;
        while (prevSibling) {
          if (prevSibling.nodeType === Node.TEXT_NODE) {
            textNodeIndex++;
          }
          prevSibling = prevSibling.previousSibling;
        }
      }
      
      path.unshift({
        name: current.nodeName,
        index: index,
        id: current.id || null,
        isTextNode: current.nodeType === Node.TEXT_NODE,
        textNodeIndex: textNodeIndex
      });
      current = current.parentElement;
    }
    
    return path;
  }

  // Find node from path
  findNodeFromPath(path, doc) {
    if (!path || path.length === 0) return null;
    
    let current = doc.body;
    for (let i = 0; i < path.length; i++) {
      const step = path[i];
      
      // If this step is looking for a text node, we need special handling
      if (step.isTextNode) {
        // Find the parent element first (should be the previous step or current)
        // The text node should be a direct child of 'current'
        let textNodeCount = 0;
        for (let child of current.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) {
            if (textNodeCount === step.textNodeIndex) {
              return child;
            }
            textNodeCount++;
          }
        }
        // If we couldn't find the exact text node, return null
        return null;
      }
      
      // For element nodes, use the original logic
      const children = Array.from(current.childNodes).filter(n => 
        n.nodeName === step.name && (step.id === null || n.id === step.id)
      );
      
      if (children.length > step.index) {
        current = children[step.index];
      } else {
        return null;
      }
    }
    
    return current;
  }

  // Add highlight mark element to DOM
  addHighlightToDOM(range, highlightId, color = 'yellow') {
    try {
      // Check if range is valid
      if (!range || range.collapsed) {
        console.warn('Invalid or collapsed range');
        return false;
      }
      
      const doc = range.startContainer.ownerDocument;
      const startContainer = range.startContainer;
      const endContainer = range.endContainer;
      
      // Determine the class name based on color
      // If color is 'note', use has-note class for underline-only style
      // If color is null/empty, don't add a color class
      let colorClass = '';
      let hasNoteClass = false;
      
      if (color === 'note') {
        hasNoteClass = true;
      } else if (color) {
        colorClass = color;
      }
      
      // Case 1: Single text node selection - simplest and most common case
      if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
        const text = startContainer.textContent;
        const startOffset = Math.max(0, Math.min(range.startOffset, text.length));
        const endOffset = Math.max(startOffset, Math.min(range.endOffset, text.length));
        
        if (startOffset >= endOffset) {
          console.warn('Invalid offsets for single node selection');
          return false;
        }
        
        const beforeText = text.substring(0, startOffset);
        const selectedText = text.substring(startOffset, endOffset);
        const afterText = text.substring(endOffset);
        
        const frag = document.createDocumentFragment();
        
        if (beforeText) {
          frag.appendChild(document.createTextNode(beforeText));
        }
        
        const mark = document.createElement('mark');
        mark.classList.add('citron-highlight');
        if (hasNoteClass) {
          mark.classList.add('has-note');
        } else if (colorClass) {
          mark.classList.add(colorClass);
        }
        mark.dataset.highlightId = highlightId;
        mark.dataset.color = color || '';
        mark.textContent = selectedText;
        frag.appendChild(mark);
        
        if (afterText) {
          frag.appendChild(document.createTextNode(afterText));
        }
        
        startContainer.parentNode.replaceChild(frag, startContainer);
        return true;
      }
      
      // Case 2: Multi-node or cross-paragraph selection
      // Use TreeWalker to collect all text nodes in the range
      const root = range.commonAncestorContainer;
      const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
      
      const textNodesToHighlight = [];
      let node = walker.nextNode();
      
      while (node) {
        // Check if this text node intersects with the range
        const nodeRange = doc.createRange();
        nodeRange.selectNodeContents(node);
        
        // Skip if node is completely outside the selection range
        const compareStart = range.compareBoundaryPoints(Range.END_TO_START, nodeRange);
        const compareEnd = range.compareBoundaryPoints(Range.START_TO_END, nodeRange);
        
        if (compareStart >= 0 || compareEnd <= 0) {
          node = walker.nextNode();
          continue;
        }
        
        // Calculate the actual highlight range within this node
        let highlightStart = 0;
        let highlightEnd = node.length;
        
        // If this is the start container, adjust the start offset
        if (node === startContainer && startContainer.nodeType === Node.TEXT_NODE) {
          highlightStart = Math.max(0, Math.min(range.startOffset, node.length));
        }
        
        // If this is the end container, adjust the end offset
        if (node === endContainer && endContainer.nodeType === Node.TEXT_NODE) {
          highlightEnd = Math.max(highlightStart, Math.min(range.endOffset, node.length));
        }
        
        // Only add if there's actual content to highlight
        if (highlightStart < highlightEnd) {
          textNodesToHighlight.push({
            node: node,
            start: highlightStart,
            end: highlightEnd
          });
        }
        
        node = walker.nextNode();
      }
      
      if (textNodesToHighlight.length === 0) {
        console.warn('No text nodes found in range');
        return false;
      }
      
      // Apply highlight to each text node segment
      // Process from end to start to avoid offset shifts
      let successCount = 0;
      for (let i = textNodesToHighlight.length - 1; i >= 0; i--) {
        const item = textNodesToHighlight[i];
        
        if (item.start >= item.end) continue;
        
        const txtNode = item.node;
        const text = txtNode.textContent;
        
        // Skip if offsets are invalid
        if (item.start < 0 || item.end > text.length || item.start >= item.end) {
          continue;
        }
        
        const beforeText = text.substring(0, item.start);
        const selectedText = text.substring(item.start, item.end);
        const afterText = text.substring(item.end);
        
        const frag = document.createDocumentFragment();
        
        if (beforeText) {
          frag.appendChild(document.createTextNode(beforeText));
        }
        
        const mark = document.createElement('mark');
        mark.classList.add('citron-highlight');
        if (hasNoteClass) {
          mark.classList.add('has-note');
        } else if (colorClass) {
          mark.classList.add(colorClass);
        }
        mark.dataset.highlightId = highlightId;
        mark.dataset.color = color || '';
        mark.textContent = selectedText;
        frag.appendChild(mark);
        
        if (afterText) {
          frag.appendChild(document.createTextNode(afterText));
        }
        
        txtNode.parentNode.replaceChild(frag, txtNode);
        successCount++;
      }
      
      return successCount > 0;
      
    } catch (e) {
      console.error('Error applying highlight:', e);
      return false;
    }
  }

  // Remove highlight from selected text
  removeHighlightFromSelection() {
    const frame = document.getElementById('viewerFrame');
    if (!frame || !frame.contentDocument) return;
    
    const doc = frame.contentDocument;
    const selection = doc.getSelection();
    
    if (!selection || !selection.toString().trim()) {
      // No valid selection
      this.hideHighlightColorPicker();
      return;
    }
    
    const range = selection.getRangeAt(0);
    const selectedText = selection.toString().trim();
    
    // Find and remove any highlights that overlap with the current selection
    try {
      // Get all mark elements in the current selection
      const marksInRange = doc.querySelectorAll('mark.citron-highlight');
      
      for (const mark of marksInRange) {
        const markRange = doc.createRange();
        markRange.selectNodeContents(mark);
        
        // Check if the mark overlaps with the selection
        if (range.compareBoundaryPoints(Range.END_TO_START, markRange) < 0 &&
            range.compareBoundaryPoints(Range.START_TO_END, markRange) > 0) {
          // The mark is within or overlaps with the selection
          const highlightId = mark.dataset.highlightId;
          
          // Remove the mark element and unwrap its contents
          const parent = mark.parentNode;
          while (mark.firstChild) {
            parent.insertBefore(mark.firstChild, mark);
          }
          parent.removeChild(mark);
          parent.normalize();
          
          // Remove from storage
          if (highlightId && this.currentBookKey) {
            this.deleteHighlightById(highlightId);
          }
        }
      }
      
      // Clear selection
      selection.removeAllRanges();
      
      // Hide color picker
      this.hideHighlightColorPicker();
      
      console.log('Highlight removed from selection');
    } catch (e) {
      console.warn('Could not remove highlight:', e);
    }
  }
  
  // Delete a highlight by ID from storage
  deleteHighlightById(highlightId) {
    try {
      const highlights = JSON.parse(localStorage.getItem(this.HIGHLIGHTS_KEY) || '{}');
      
      if (highlights[this.currentBookKey]) {
        highlights[this.currentBookKey] = highlights[this.currentBookKey].filter(
          h => h.id !== highlightId
        );
        localStorage.setItem(this.HIGHLIGHTS_KEY, JSON.stringify(highlights));
      }
    } catch (e) {
      console.warn('Could not delete highlight:', e);
    }
  }

  // Save highlight to storage
  saveHighlight(highlight) {
    try {
      const highlights = JSON.parse(localStorage.getItem(this.HIGHLIGHTS_KEY) || '{}');
      
      if (!highlights[this.currentBookKey]) {
        highlights[this.currentBookKey] = [];
      }
      
      highlights[this.currentBookKey].push(highlight);
      localStorage.setItem(this.HIGHLIGHTS_KEY, JSON.stringify(highlights));
    } catch (e) {
      console.warn('Could not save highlight:', e);
    }
  }

  // Load and apply all highlights for current book
  loadAndApplyHighlights() {
    if (!this.currentBookKey) return;
    
    try {
      const highlights = JSON.parse(localStorage.getItem(this.HIGHLIGHTS_KEY) || '{}');
      const bookHighlights = highlights[this.currentBookKey] || [];
      
      if (bookHighlights.length === 0) return;
      
      const frame = document.getElementById('viewerFrame');
      if (!frame || !frame.contentDocument) return;
      
      const doc = frame.contentDocument;
      
      // Apply highlights for current chapter
      const currentChapterHighlights = bookHighlights.filter(
        h => h.chapterIndex === this.currentChapterIndex
      );
      
      for (const highlight of currentChapterHighlights) {
        this.applyExistingHighlight(doc, highlight);
      }
    } catch (e) {
      console.warn('Could not load highlights:', e);
    }
  }

  // Apply an existing highlight to the DOM
  applyExistingHighlight(doc, highlight) {
    try {
      // Try to find the start and end text nodes using the stored paths and offsets
      const startNode = this.findNodeFromPath(highlight.startParentPath, doc);
      const endNode = this.findNodeFromPath(highlight.endParentPath, doc);
      
      if (startNode && endNode) {
        // Both start and end nodes found - use path-based reconstruction
        let startTextNode = null;
        let endTextNode = null;
        let actualStartOffset = 0;
        let actualEndOffset = 0;
        
        // Process start node: find the actual text node and offset
        if (startNode.nodeType === Node.TEXT_NODE) {
          // Start node is already a text node, use it directly
          startTextNode = startNode;
          actualStartOffset = Math.min(Math.max(0, highlight.startOffset), startNode.length);
        } else {
          // Start node is an element - use textNodeIndex from the last step of the path
          const lastStep = highlight.startParentPath[highlight.startParentPath.length - 1];
          const result = this.findTextNodeByIndex(startNode, lastStep.textNodeIndex, highlight.startOffset);
          if (result) {
            startTextNode = result.textNode;
            actualStartOffset = result.offset;
          }
        }
        
        // Process end node: find the actual text node and offset
        if (endNode.nodeType === Node.TEXT_NODE) {
          // End node is already a text node, use it directly
          endTextNode = endNode;
          actualEndOffset = Math.min(Math.max(0, highlight.endOffset), endNode.length);
        } else {
          // End node is an element - use textNodeIndex from the last step of the path
          const lastStep = highlight.endParentPath[highlight.endParentPath.length - 1];
          const result = this.findTextNodeByIndex(endNode, lastStep.textNodeIndex, highlight.endOffset);
          if (result) {
            endTextNode = result.textNode;
            actualEndOffset = result.offset;
          }
        }
        
        // If we found both text nodes, create the range
        if (startTextNode && endTextNode) {
          const range = doc.createRange();
          
          try {
            range.setStart(startTextNode, actualStartOffset);
            range.setEnd(endTextNode, actualEndOffset);
            
            if (!range.collapsed) {
              this.addHighlightToDOM(range, highlight.id, highlight.color || 'yellow');
              return;
            }
          } catch (e) {
            console.warn('Failed to create range from paths:', e);
          }
        }
      }
      
      // Fallback: search by text content if node path method failed
      const bodyText = doc.body.textContent;
      const searchText = highlight.text;
      const index = bodyText.indexOf(searchText);
      
      if (index !== -1) {
        // Simple approach - find and highlight first occurrence
        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        let currentPos = 0;
        let foundStart = false;
        let foundStartNode = null;
        let startOffset = 0;
        let endNode = null;
        let endOffset = 0;
        
        while (node = walker.nextNode()) {
          const nodeLength = node.length;
          
          if (!foundStart && currentPos + nodeLength > index) {
            foundStartNode = node;
            startOffset = index - currentPos;
            foundStart = true;
          }
          
          if (foundStart && currentPos + nodeLength >= index + searchText.length) {
            endNode = node;
            endOffset = index + searchText.length - currentPos;
            break;
          }
          
          currentPos += nodeLength;
        }
        
        if (foundStartNode && endNode) {
          const range = doc.createRange();
          range.setStart(foundStartNode, startOffset);
          range.setEnd(endNode, endOffset);
          this.addHighlightToDOM(range, highlight.id, highlight.color || 'yellow');
        }
      }
    } catch (e) {
      console.warn('Could not apply existing highlight:', e);
    }
  }
  
  // Find text node by its index among siblings and the offset within it
  // This uses the textNodeIndex stored in the path to locate the exact text node
  findTextNodeByIndex(elementNode, textNodeIndex, offset) {
    if (textNodeIndex < 0) {
      // Fallback if textNodeIndex is not available
      return this.findExactTextNode(elementNode, offset);
    }
    
    let count = 0;
    for (let child of elementNode.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (count === textNodeIndex) {
          // Found the target text node
          return {
            textNode: child,
            offset: Math.min(Math.max(0, offset), child.length)
          };
        }
        count++;
      }
    }
    
    // If not found among direct children, search in descendant elements
    // This handles cases like <p><span>text</span></p> where the text node is inside a span
    for (let child of elementNode.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const result = this.findTextNodeByIndexInElement(child, textNodeIndex, offset);
        if (result) return result;
      }
    }
    
    return null;
  }
  
  // Helper to find text node by index within an element (recursive)
  findTextNodeByIndexInElement(elementNode, textNodeIndex, offset) {
    let count = 0;
    for (let child of elementNode.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (count === textNodeIndex) {
          return {
            textNode: child,
            offset: Math.min(Math.max(0, offset), child.length)
          };
        }
        count++;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const result = this.findTextNodeByIndexInElement(child, textNodeIndex, offset);
        if (result) return result;
      }
    }
    return null;
  }
  
  // Find the exact text node that was originally selected
  // This handles nested structures like <p><span>text</span></p>
  // For start node: find the text node at the given offset position
  // For end node: find the text node at the given offset position
  // Returns { textNode, offset } or null if not found
  findExactTextNode(elementNode, targetOffset) {
    // The targetOffset is relative to the original startContainer/endContainer text node
    // We need to find which text node within this element matches that offset pattern
    
    // Strategy: Look for a text node whose length is >= targetOffset
    // This works because when saving, the offset is relative to that specific text node
    
    // First, try direct child text nodes
    for (let child of elementNode.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        // If this text node can accommodate the offset, it's likely our target
        if (targetOffset <= child.length) {
          return {
            textNode: child,
            offset: Math.min(targetOffset, child.length)
          };
        }
      }
    }
    
    // If no direct child text node matches, search in descendant elements
    // Look for span or other inline elements that contain text
    for (let child of elementNode.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        // Check if this element contains a single text node directly
        let directTextChild = null;
        for (let grandChild of child.childNodes) {
          if (grandChild.nodeType === Node.TEXT_NODE) {
            if (directTextChild) {
              // Multiple text children, skip this complex case for now
              directTextChild = null;
              break;
            }
            directTextChild = grandChild;
          } else if (grandChild.nodeType === Node.ELEMENT_NODE) {
            // Nested elements, too complex
            directTextChild = null;
            break;
          }
        }
        
        // If this element has exactly one direct text child
        if (directTextChild && targetOffset <= directTextChild.length) {
          return {
            textNode: directTextChild,
            offset: Math.min(targetOffset, directTextChild.length)
          };
        }
        
        // Recursively search deeper
        const result = this.findExactTextNode(child, targetOffset);
        if (result) return result;
      }
    }
    
    // Fallback: return the first text node found with offset clamped
    const walker = document.createTreeWalker(elementNode, NodeFilter.SHOW_TEXT, null, false);
    const firstTextNode = walker.nextNode();
    if (firstTextNode) {
      return {
        textNode: firstTextNode,
        offset: Math.min(Math.max(0, targetOffset), firstTextNode.length)
      };
    }
    
    return null;
  }
  
  // Find text node and offset within an element node
  // Returns { textNode, offset } or null if not found
  findTextNodeAndOffset(elementNode, targetOffset) {
    let charCount = 0;
    
    const findInChildren = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (charCount + node.length > targetOffset) {
          // Found the text node containing the target offset
          return {
            textNode: node,
            offset: targetOffset - charCount
          };
        }
        charCount += node.length;
        return null;
      }
      
      // Recursively search in child nodes
      for (let child of node.childNodes) {
        const result = findInChildren(child);
        if (result) return result;
      }
      
      return null;
    };
    
    return findInChildren(elementNode);
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

  // Open note popover for current selection
  openNoteForSelection() {
    const frame = document.getElementById('viewerFrame');
    if (!frame || !frame.contentDocument) return;
    
    const doc = frame.contentDocument;
    const selection = doc.getSelection();
    
    if (!selection || !selection.toString().trim()) {
      // No valid selection, hide any existing popover
      this.closeNotePopover();
      return;
    }
    
    // Create a highlight first if the selection is not already highlighted
    const range = selection.getRangeAt(0).cloneRange();
    let highlightEl = null;
    
    // Check if selection is within a highlight mark
    if (range.commonAncestorContainer.nodeType === Node.TEXT_NODE) {
      highlightEl = range.commonAncestorContainer.parentElement.closest('mark.citron-highlight');
    } else if (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE) {
      highlightEl = range.commonAncestorContainer.closest('mark.citron-highlight');
    }
    
    if (highlightEl && highlightEl.dataset.highlightId) {
      // Selection is within an existing highlight, show/edit note for it
      this.showNotePopover(highlightEl.dataset.highlightId, highlightEl);
    } else {
      // Selection is not highlighted yet, create a note-only highlight (underline only, no background)
      const selectedText = selection.toString().trim();
      const chapterIndex = this.currentChapterIndex;
      const chapterHref = this.chapters[chapterIndex]?.href || '';
      
      // Create highlight object - color is 'note' to indicate underline-only style
      const highlight = {
        id: 'hl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        text: selectedText,
        color: 'note', // 'note' color means underline only, no background
        chapterIndex: chapterIndex,
        chapterHref: chapterHref,
        timestamp: Date.now(),
        startOffset: range.startOffset,
        endOffset: range.endOffset,
        startParentPath: this.getNodePath(range.startContainer),
        endParentPath: this.getNodePath(range.endContainer)
      };
      
      // Save highlight first
      this.saveHighlight(highlight);
      
      // Apply visual highlight with 'note' style (underline only)
      const success = this.addHighlightToDOM(range, highlight.id, 'note');
      
      if (success) {
        // Clear selection
        selection.removeAllRanges();
        
        // Find the newly created highlight element
        const newHighlightEl = doc.querySelector(`mark.citron-highlight[data-highlight-id="${highlight.id}"]`);
        if (newHighlightEl) {
          // Show note popover for the new highlight
          this.showNotePopover(highlight.id, newHighlightEl);
        }
      } else {
        // If highlighting failed, remove from storage and show error
        this.deleteHighlightById(highlight.id);
        alert(this.settings.language === 'en' 
          ? 'Failed to add note. Please try again.' 
          : '添加笔记失败，请重试。');
      }
    }
    
    // Hide color picker if open
    this.hideHighlightColorPicker();
  }

  // Show note popover for an existing highlight
  showNotePopover(highlightId, highlightEl) {
    this.currentNoteHighlightId = highlightId;
    
    // Get existing note data
    const notes = JSON.parse(localStorage.getItem(this.NOTES_KEY) || '{}');
    const bookNotes = notes[this.currentBookKey] || {};
    const noteData = bookNotes[highlightId];
    
    // Create popover if it doesn't exist
    if (!this.notePopover) {
      this.createNotePopover();
    }
    
    // Populate popover content
    const highlightText = highlightEl.textContent.trim().substring(0, 100);
    this.notePopover.querySelector('.note-highlight-text').textContent = highlightText;
    
    const textarea = this.notePopover.querySelector('.note-textarea');
    textarea.value = noteData ? noteData.content : '';
    textarea.placeholder = this.settings.language === 'en' 
      ? 'Add your note here...' 
      : '在此添加笔记...';
    
    // Update character count
    this.updateNoteCharCount(textarea.value.length);
    
    // Position popover near the highlight
    this.positionNotePopover(highlightEl);
    
    // Show popover
    this.notePopover.classList.add('active');
    
    // Focus textarea if no existing note
    if (!noteData) {
      textarea.focus();
    }
  }

  // Create note popover DOM element
  createNotePopover() {
    const popover = document.createElement('div');
    popover.className = 'note-popover';
    popover.innerHTML = `
      <div class="note-highlight-text"></div>
      <textarea class="note-textarea" maxlength="500" rows="4"></textarea>
      <div class="note-char-count"><span class="note-char-current">0</span>/500</div>
      <div class="note-actions">
        <button class="note-btn note-btn-cancel">${this.settings.language === 'en' ? 'Cancel' : '取消'}</button>
        <button class="note-btn note-btn-save">${this.settings.language === 'en' ? 'Done' : '完成'}</button>
      </div>
    `;
    
    document.body.appendChild(popover);
    this.notePopover = popover;
    
    // Bind events
    const textarea = popover.querySelector('.note-textarea');
    textarea.addEventListener('input', (e) => {
      this.updateNoteCharCount(e.target.value.length);
    });
    
    popover.querySelector('.note-btn-save').addEventListener('click', () => {
      this.saveCurrentNote();
    });
    
    popover.querySelector('.note-btn-cancel').addEventListener('click', () => {
      this.closeNotePopover();
    });
    
    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.notePopover && this.notePopover.classList.contains('active')) {
        this.closeNotePopover();
      }
    });
  }

  // Update character count display
  updateNoteCharCount(count) {
    if (this.notePopover) {
      this.notePopover.querySelector('.note-char-current').textContent = count;
    }
  }

  // Position popover to the RIGHT or BOTTOM-RIGHT of highlight element
  positionNotePopover(highlightEl) {
    if (!this.notePopover) return;
    
    const rect = highlightEl.getBoundingClientRect();
    const popoverRect = this.notePopover.getBoundingClientRect();
    
    // Calculate position - try RIGHT first, then BOTTOM-RIGHT if needed
    let top = rect.top + window.scrollY;
    let left = rect.right + window.scrollX + 8;
    
    // Check if popover would go off right edge
    if (left + popoverRect.width > window.scrollX + window.innerWidth) {
      // Try positioning at BOTTOM-RIGHT
      left = rect.right + window.scrollX - popoverRect.width;
      top = rect.bottom + window.scrollY + 8;
      
      // Check if bottom-right would go below viewport
      if (top + popoverRect.height > window.scrollY + window.innerHeight) {
        // Fallback: position at TOP-RIGHT
        top = rect.top + window.scrollY - popoverRect.height - 8;
      }
    }
    
    // Ensure popover doesn't go off top edge
    if (top < window.scrollY) {
      top = window.scrollY + 10;
    }
    
    // Ensure popover doesn't go off left edge
    if (left < window.scrollX) {
      left = window.scrollX + 10;
    }
    
    this.notePopover.style.top = top + 'px';
    this.notePopover.style.left = left + 'px';
  }

  // Save current note
  saveCurrentNote() {
    if (!this.currentNoteHighlightId || !this.notePopover) return;
    
    const textarea = this.notePopover.querySelector('.note-textarea');
    const content = textarea.value.trim();
    
    // Get or create notes structure
    const notes = JSON.parse(localStorage.getItem(this.NOTES_KEY) || '{}');
    if (!notes[this.currentBookKey]) {
      notes[this.currentBookKey] = {};
    }
    
    if (content) {
      // Save note
      notes[this.currentBookKey][this.currentNoteHighlightId] = {
        content: content,
        updatedAt: Date.now()
      };
      
      // Add visual indicator to highlight
      this.addNoteIndicatorToHighlight(this.currentNoteHighlightId);
    } else {
      // Delete note if empty
      delete notes[this.currentBookKey][this.currentNoteHighlightId];
      
      // Remove visual indicator from highlight
      this.removeNoteIndicatorFromHighlight(this.currentNoteHighlightId);
    }
    
    localStorage.setItem(this.NOTES_KEY, JSON.stringify(notes));
    
    this.closeNotePopover();
  }

  // Add note indicator (micro-badge) to highlight
  addNoteIndicatorToHighlight(highlightId) {
    const frame = document.getElementById('viewerFrame');
    if (!frame || !frame.contentDocument) return;
    
    const markEl = frame.contentDocument.querySelector(`mark.citron-highlight[data-highlight-id="${highlightId}"]`);
    if (markEl && !markEl.classList.contains('has-note')) {
      markEl.classList.add('has-note');
    }
  }

  // Remove note indicator from highlight
  removeNoteIndicatorFromHighlight(highlightId) {
    const frame = document.getElementById('viewerFrame');
    if (!frame || !frame.contentDocument) return;
    
    const markEl = frame.contentDocument.querySelector(`mark.citron-highlight[data-highlight-id="${highlightId}"]`);
    if (markEl) {
      markEl.classList.remove('has-note');
    }
  }

  // Close note popover
  closeNotePopover() {
    if (this.notePopover) {
      this.notePopover.classList.remove('active');
    }
    this.currentNoteHighlightId = null;
  }

  // Load and apply note indicators when chapter loads
  loadAndApplyNoteIndicators() {
    if (!this.currentBookKey) return;
    
    try {
      const notes = JSON.parse(localStorage.getItem(this.NOTES_KEY) || '{}');
      const bookNotes = notes[this.currentBookKey] || {};
      
      if (Object.keys(bookNotes).length === 0) return;
      
      const frame = document.getElementById('viewerFrame');
      if (!frame || !frame.contentDocument) return;
      
      // Get highlights for current chapter to filter notes
      const highlights = JSON.parse(localStorage.getItem(this.HIGHLIGHTS_KEY) || '{}');
      const bookHighlights = highlights[this.currentBookKey] || [];
      const currentChapterHighlightIds = bookHighlights
        .filter(h => h.chapterIndex === this.currentChapterIndex)
        .map(h => h.id);
      
      // Apply indicators only to highlights in current chapter that have notes
      for (const highlightId of Object.keys(bookNotes)) {
        if (currentChapterHighlightIds.includes(highlightId)) {
          this.addNoteIndicatorToHighlight(highlightId);
        }
      }
    } catch (e) {
      console.warn('Could not load note indicators:', e);
    }
  }

  // Setup click listener on highlights to show notes
  setupHighlightClickListeners(frame) {
    try {
      const doc = frame.contentDocument || frame.contentWindow.document;
      if (!doc) return;
      
      // Use event delegation for highlight clicks
      doc.addEventListener('click', (e) => {
        const highlightEl = e.target.closest('mark.citron-highlight');
        if (highlightEl && highlightEl.dataset.highlightId) {
          // Only show popover for highlights that have notes (marked with has-note class)
          if (highlightEl.classList.contains('has-note')) {
            // Check if click is a simple click (not part of a selection)
            const selection = doc.getSelection();
            if (selection.isCollapsed) {
              // Simple click on a note, show note popover
              this.showNotePopover(highlightEl.dataset.highlightId, highlightEl);
            }
          }
        }
      }, { capture: true });
    } catch (e) {
      console.warn('Could not setup highlight click listeners:', e);
    }
  }
}

// Initialize reader when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.reader = new CitronReader();
});
