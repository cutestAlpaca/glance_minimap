// Configuration
const CONFIG = {
  width: 120,
  minElementSize: 2,
  throttleTime: 100,
  // SPA support — debounce time after route change for content stabilization
  spaRedrawDelay: 300,
  spaStabilizeDelay: 800
};

let container, content, canvas, viewport, ctx;
let documentHeight = 0, windowHeight = 0, windowWidth = 0;
let scaleX = 0.1, scaleY = 0.1;
let isDragging = false;
let startDragX = 0, startDragY = 0, startScrollY = 0;
let longPressTimer = null;
let jumpTriggered = false;
let isLightPage = true;

// SPA support state
let lastUrl = location.href;
let spaRedrawTimer = null;
let spaStabilizeTimer = null;

// ==========================================
// Scroll Target Abstraction
// For normal pages: scrollTarget = null → use window/document
// For SPA pages with container scroll: scrollTarget = the scrollable div
// ==========================================
let scrollTarget = null;
let scrollTargetListener = null;

function findScrollContainer() {
  // If the document itself is scrollable (scrollHeight > clientHeight + threshold),
  // then use window scroll as normal
  const docScrollable = document.documentElement.scrollHeight > window.innerHeight + 50;
  if (docScrollable) return null;

  // Otherwise, find the largest scrollable container in the DOM
  const candidates = document.querySelectorAll('div, main, article, section');
  let bestEl = null;
  let bestArea = 0;

  for (const el of candidates) {
    // Skip our own minimap
    if (el.id && el.id.startsWith('glance-minimap')) continue;
    if (el.scrollHeight <= el.clientHeight + 50) continue;
    if (el.clientHeight < window.innerHeight * 0.3) continue;

    const style = window.getComputedStyle(el);
    const ov = style.overflowY;
    if (ov === 'auto' || ov === 'scroll' || ov === 'overlay') {
      const area = el.clientWidth * el.clientHeight;
      if (area > bestArea) {
        bestArea = area;
        bestEl = el;
      }
    }
  }

  return bestEl;
}

// Unified scroll getters
function getScrollHeight() {
  if (scrollTarget) return scrollTarget.scrollHeight;
  return document.documentElement.scrollHeight;
}

function getScrollTop() {
  if (scrollTarget) return scrollTarget.scrollTop;
  return window.scrollY;
}

function getClientHeight() {
  if (scrollTarget) return scrollTarget.clientHeight;
  return window.innerHeight;
}

function setScrollTop(val, behavior) {
  if (scrollTarget) {
    scrollTarget.scrollTo({ top: val, behavior: behavior || 'instant' });
  } else {
    window.scrollTo({ top: val, behavior: behavior || 'instant' });
  }
}

// ==========================================
// Core idea: always follow the scroll target's scrollbar.
// scaleY = clientHeight / scrollHeight
// canvas.height = clientHeight (always 1:1 with visible height)
// viewport position = scrollTop * scaleY (mirrors scrollbar thumb)
// ==========================================

function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
}

function initMinimap() {
  container = document.createElement('div');
  container.id = 'glance-minimap-container';

  content = document.createElement('div');
  content.id = 'glance-minimap-content';
  content.style.position = 'absolute';
  content.style.width = '100%';
  content.style.top = '0';
  content.style.left = '0';

  canvas = document.createElement('canvas');
  canvas.id = 'glance-minimap-canvas';
  
  viewport = document.createElement('div');
  viewport.id = 'glance-minimap-viewport';

  content.appendChild(canvas);
  content.appendChild(viewport);
  container.appendChild(content);
  document.body.appendChild(container);

  ctx = canvas.getContext('2d');

  // Detect scroll target before bindEvents
  scrollTarget = findScrollContainer();

  bindEvents();
  requestAnimationFrame(() => updateDimensionsAndDraw());
}

function bindScrollListener() {
  // Remove previous listener if any
  if (scrollTargetListener) {
    scrollTargetListener.remove();
    scrollTargetListener = null;
  }

  let isScrollTicking = false;
  const onScroll = () => {
    if (!isScrollTicking) {
      window.requestAnimationFrame(() => {
        updateViewportPosition();
        isScrollTicking = false;
      });
      isScrollTicking = true;
    }
  };

  // Capture the current scrollTarget value in a local const so the remove
  // callback always references the element that was actually listened on,
  // even if the outer `scrollTarget` variable is later reassigned to null.
  const currentTarget = scrollTarget;

  if (currentTarget) {
    currentTarget.addEventListener('scroll', onScroll, { passive: true });
    scrollTargetListener = { remove: () => currentTarget.removeEventListener('scroll', onScroll) };
  } else {
    window.addEventListener('scroll', onScroll, { passive: true });
    scrollTargetListener = { remove: () => window.removeEventListener('scroll', onScroll) };
  }
}

function bindEvents() {
  window.addEventListener('resize', throttle(() => {
    updateDimensionsAndDraw();
  }, CONFIG.throttleTime));

  // Bind scroll listener to the detected scroll target
  bindScrollListener();

  container.addEventListener('mousedown', (e) => {
    isDragging = true;
    jumpTriggered = false;
    startDragX = e.clientX;
    startDragY = e.clientY;
    startScrollY = getScrollTop();
    
    longPressTimer = setTimeout(() => {
      if (isDragging && !jumpTriggered) {
        jumpTriggered = true;
        const rect = container.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const maxScroll = documentHeight - windowHeight;
        if (maxScroll <= 0) return;
        
        // Convert click position on minimap track to scroll ratio
        const viewportH = windowHeight * scaleY;
        const maxViewportTop = windowHeight - viewportH;
        // clickY represents where the CENTER of the viewport should be
        const targetViewportTop = Math.max(0, Math.min(clickY - viewportH / 2, maxViewportTop));
        const targetRatio = targetViewportTop / maxViewportTop;
        let targetScrollY = targetRatio * maxScroll;
        
        targetScrollY = Math.max(0, Math.min(targetScrollY, maxScroll));
        setScrollTop(targetScrollY, 'instant');
        
        startDragY = e.clientY;
        startScrollY = targetScrollY;
      }
    }, 300);
  });

  let dragRafId = null;
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const maxDocScroll = documentHeight - windowHeight;
    if (maxDocScroll <= 0) return;

    const deltaY = e.clientY - startDragY;
    
    if (Math.abs(deltaY) > 3) {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      // Convert minimap pixel delta to scroll delta using the ratio
      const viewportH = windowHeight * scaleY;
      const maxViewportTop = windowHeight - viewportH;
      if (maxViewportTop <= 0) return;
      const scrollDelta = (deltaY / maxViewportTop) * maxDocScroll;
      let newScroll = startScrollY + scrollDelta;
      newScroll = Math.max(0, Math.min(newScroll, maxDocScroll));
      
      if (dragRafId) cancelAnimationFrame(dragRafId);
      dragRafId = window.requestAnimationFrame(() => {
        setScrollTop(newScroll, 'instant');
      });
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    
    if (isDragging) {
      isDragging = false;
      
      if (!jumpTriggered && Math.abs(e.clientY - startDragY) <= 3 && Math.abs(e.clientX - startDragX) <= 3) {
        const originalDisplay = container.style.display;
        container.style.display = 'none';
        
        const el = document.elementFromPoint(e.clientX, e.clientY);
        
        if (el) {
          try {
            const eventInit = { bubbles: true, cancelable: true, view: window, clientX: e.clientX, clientY: e.clientY };
            el.dispatchEvent(new MouseEvent('mousedown', eventInit));
            el.dispatchEvent(new MouseEvent('mouseup', eventInit));
            
            if (typeof el.click === 'function') {
              el.click();
            } else {
              el.dispatchEvent(new MouseEvent('click', eventInit));
            }
          } catch(err) {
            console.error('Glance minimap click forwarding error:', err);
          }
        }

        container.style.display = originalDisplay;
      }
    }
  });

  // Watch for document/container height changes
  const resizeObserver = new ResizeObserver(throttle(() => {
    const h = getScrollHeight();
    if (Math.abs(h - documentHeight) > 100) {
      updateDimensionsAndDraw();
    }
  }, 1000));
  
  if (document.body) resizeObserver.observe(document.body);
  resizeObserver.observe(document.documentElement);
  if (scrollTarget) resizeObserver.observe(scrollTarget);
  
  // Smart MutationObserver — handles both minor updates and SPA route swaps
  let pendingMutationRedraw = null;
  const mutationObserver = new MutationObserver((mutations) => {
    // Heuristic: large-scale DOM swap = SPA navigation
    // Count total added/removed nodes across all mutations
    let totalChanges = 0;
    for (const m of mutations) {
      totalChanges += m.addedNodes.length + m.removedNodes.length;
    }

    if (totalChanges > 20) {
      // Large DOM swap detected — likely SPA route change, redraw soon
      if (pendingMutationRedraw) clearTimeout(pendingMutationRedraw);
      pendingMutationRedraw = setTimeout(() => {
        pendingMutationRedraw = null;
        // Re-detect scroll container on large DOM changes
        redetectScrollTarget();
        updateDimensionsAndDraw();
      }, CONFIG.spaRedrawDelay);
    } else {
      // Minor update — throttled check
      if (!pendingMutationRedraw) {
        const h = getScrollHeight();
        if (Math.abs(h - documentHeight) > 100) {
          if (pendingMutationRedraw) clearTimeout(pendingMutationRedraw);
          pendingMutationRedraw = setTimeout(() => {
            pendingMutationRedraw = null;
            updateDimensionsAndDraw();
          }, 1500);
        }
      }
    }
  });
  
  if (document.body) {
    mutationObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // ==========================================
  // SPA Navigation Detection
  // Intercept History API & popstate for client-side routing
  // ==========================================
  setupSpaDetection();
}

/**
 * Re-detect the scroll target (e.g. after SPA navigation swaps containers)
 * and rebind scroll listener if the target changed.
 */
function redetectScrollTarget() {
  const newTarget = findScrollContainer();
  if (newTarget !== scrollTarget) {
    scrollTarget = newTarget;
    bindScrollListener();
  }
}

function updateViewportPosition() {
  if (!container) return;
  
  // Re-read live scroll height to stay perfectly in sync
  const liveScrollHeight = getScrollHeight();
  if (liveScrollHeight !== documentHeight) {
    // Content height changed (lazy content, images loaded, etc.) — update scale immediately
    documentHeight = liveScrollHeight;
    scaleY = windowHeight / documentHeight;
    viewport.style.height = `${windowHeight * scaleY}px`;
    // Schedule a canvas redraw on next idle
    requestAnimationFrame(() => updateDimensionsAndDraw());
  }
  
  // Use the scrollbar's own RATIO formula for pixel-perfect sync:
  // ratio = scrollTop / maxScroll (0 to 1, same as scrollbar thumb)
  // viewportTop = ratio * maxViewportTop
  const maxScroll = documentHeight - windowHeight;
  if (maxScroll <= 0) {
    viewport.style.transform = 'translateY(0px)';
    return;
  }
  
  const scrollRatio = Math.min(getScrollTop() / maxScroll, 1);
  const viewportH = windowHeight * scaleY;
  const maxViewportTop = windowHeight - viewportH;
  viewport.style.transform = `translateY(${scrollRatio * maxViewportTop}px)`;
}

function updateDimensionsAndDraw() {
  documentHeight = getScrollHeight();
  windowHeight = getClientHeight();
  windowWidth = scrollTarget
    ? scrollTarget.clientWidth
    : (document.documentElement.scrollWidth || window.innerWidth);
  
  scaleX = CONFIG.width / windowWidth;
  
  // scaleY maps the full scroll height into exactly the visible height
  // This guarantees the minimap is always 1:1 with the visible area
  scaleY = windowHeight / documentHeight;
  
  canvas.width = CONFIG.width;
  canvas.height = windowHeight; // Always exactly match visible height!
  
  viewport.style.height = `${windowHeight * scaleY}px`;
  
  // Container always fills the full viewport — just like the native scrollbar track
  if (container) {
    container.style.height = '100vh';
  }
  
  isLightPage = getPageThemeOverrides();
  
  drawMinimap();
  updateViewportPosition();
}

function getPageThemeOverrides() {
  let r = 255, g = 255, b = 255;
  let bgFound = false;

  for (const el of [document.body, document.documentElement]) {
    if (!el) continue;
    const bg = window.getComputedStyle(el).backgroundColor;
    const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const alphaMatch = bg.match(/rgba?\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
      const a = alphaMatch ? parseFloat(alphaMatch[1]) : 1;
      if (a > 0.1) {
        r = parseInt(match[1]);
        g = parseInt(match[2]);
        b = parseInt(match[3]);
        bgFound = true;
        break;
      }
    }
  }

  let isLight = true;
  if (bgFound) {
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    isLight = brightness > 128;
  } else {
    isLight = window.matchMedia && !window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  if (isLight) {
    viewport.style.background = 'rgba(0, 0, 0, 0.15)';
    viewport.style.border = '1px solid rgba(0, 0, 0, 0.4)';
  } else {
    viewport.style.background = 'rgba(255, 255, 255, 0.15)';
    viewport.style.border = '1px solid rgba(255, 255, 255, 0.4)';
  }
  
  return isLight;
}

function drawMinimap() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const drawGroups = [
    { selector: 'pre', color: 'rgba(86, 156, 214, 0.8)' },
    { selector: 'img, svg, video, canvas', color: 'rgba(128, 128, 128, 0.4)' },
    { selector: 'h1, h2, h3, h4, h5, h6', color: isLightPage ? 'rgba(206, 145, 120, 0.8)' : 'rgba(206, 145, 120, 0.8)' },
    { selector: 'p, blockquote, li, span, a', color: isLightPage ? 'rgba(100, 100, 100, 0.5)' : 'rgba(180, 180, 180, 0.5)' }
  ];

  // Cache for filtering out fixed/sticky elements (sidebars, navbars, FABs)
  const positionCache = new Map();

  function isFixedOrSticky(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (positionCache.has(el)) return positionCache.get(el);
    
    const style = window.getComputedStyle(el);
    if (style.position === 'fixed' || style.position === 'sticky') {
      positionCache.set(el, true);
      return true;
    }
    
    const parentResult = isFixedOrSticky(el.parentElement);
    positionCache.set(el, parentResult);
    return parentResult;
  }

  // Determine the coordinate reference point for element positions
  // For container scroll: positions are relative to the container's scroll area
  const scrollTopNow = getScrollTop();

  drawGroups.forEach(group => {
    const elements = document.querySelectorAll(group.selector);
    if (elements.length === 0) return;

    ctx.fillStyle = group.color;
    ctx.beginPath();

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      // Skip our own minimap elements
      if (el.id && el.id.startsWith('glance-minimap')) continue;
      // Skip fixed/sticky elements — they don't scroll, don't belong on the map
      if (isFixedOrSticky(el)) continue;

      const rect = el.getBoundingClientRect();
      if (rect.height === 0 || rect.width === 0) continue;

      let absoluteY, x;

      if (scrollTarget) {
        // For container scroll: convert viewport-relative rect to absolute position within the scroll container
        const containerRect = scrollTarget.getBoundingClientRect();
        // Check if the element is inside the scroll container visually
        // (skip elements outside the container, like sidebar)
        if (rect.right < containerRect.left || rect.left > containerRect.right) continue;
        if (rect.bottom < containerRect.top - scrollTopNow && rect.top > containerRect.bottom + scrollTopNow) continue;

        x = (rect.left - containerRect.left + scrollTarget.scrollLeft) * scaleX;
        absoluteY = (rect.top - containerRect.top + scrollTopNow);
      } else {
        // Normal window scroll
        x = (rect.left + window.scrollX) * scaleX;
        absoluteY = rect.top + window.scrollY;
      }

      const y = absoluteY * scaleY;
      
      const w = Math.max(rect.width * scaleX, CONFIG.minElementSize);
      const h = Math.max(rect.height * scaleY, CONFIG.minElementSize);
      
      ctx.rect(x, y, w, h);
    }
    
    ctx.fill();
  });
}

// ==========================================
// SPA Navigation Detection
// ==========================================
function handleSpaNavigation() {
  const newUrl = location.href;
  if (newUrl === lastUrl) return;
  lastUrl = newUrl;

  // Re-detect scroll container — SPA may swap the content container
  if (spaRedrawTimer) clearTimeout(spaRedrawTimer);
  spaRedrawTimer = setTimeout(() => {
    spaRedrawTimer = null;
    redetectScrollTarget();
    updateDimensionsAndDraw();
  }, CONFIG.spaRedrawDelay);

  // Delayed stabilization redraw — SPA content may load async (API calls, lazy components)
  if (spaStabilizeTimer) clearTimeout(spaStabilizeTimer);
  spaStabilizeTimer = setTimeout(() => {
    spaStabilizeTimer = null;
    redetectScrollTarget();
    updateDimensionsAndDraw();
  }, CONFIG.spaStabilizeDelay);
}

function setupSpaDetection() {
  // Monkey-patch history.pushState & replaceState
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;

  history.pushState = function(...args) {
    origPushState.apply(this, args);
    handleSpaNavigation();
  };

  history.replaceState = function(...args) {
    origReplaceState.apply(this, args);
    handleSpaNavigation();
  };

  // Back/forward navigation
  window.addEventListener('popstate', () => {
    handleSpaNavigation();
  });

  // Some frameworks use hashchange for routing
  window.addEventListener('hashchange', () => {
    handleSpaNavigation();
  });
}

function getRootDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length > 2) {
    return parts.slice(-2).join('.');
  }
  return hostname;
}

// Init — check storage first, skip if page is hidden
async function checkAndInit() {
  const pageUrl = getRootDomain(location.hostname);
  const data = await chrome.storage.local.get({ hiddenPages: [] });
  if (!data.hiddenPages.includes(pageUrl)) {
    initMinimap();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkAndInit);
} else {
  checkAndInit();
}

// Show/Hide from background script (persistent toggle)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'hideMinimap') {
    if (container) container.style.display = 'none';
  } else if (request.action === 'showMinimap') {
    if (!container) {
      initMinimap();
    } else {
      container.style.display = 'block';
      redetectScrollTarget();
      updateDimensionsAndDraw();
    }
  }
});
