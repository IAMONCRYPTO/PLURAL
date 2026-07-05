/* ═══════════════════════════════════════════
   PLURAL — Landing Page Logic
   "Unity With AI."
   ═══════════════════════════════════════════ */

import { Supabase } from './supabase.js';
import { Storage } from './storage.js';

export function initLanding() {
  const landingPage = document.getElementById('landingPage');
  const enterBtn = document.getElementById('landingEnterBtn');
  const headerBtn = document.getElementById('landingHeaderBtn');
  const authScreen = document.getElementById('authScreen');
  const appLayout = document.getElementById('appLayout');

  if (!landingPage) return;

  // 1. Initialize Scroll Reveal Animations
  const revealElements = document.querySelectorAll('.reveal-on-scroll');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });

  revealElements.forEach(el => revealObserver.observe(el));

  // 2. Initialize 3D Tilt Card Effects
  const tiltCards = document.querySelectorAll('.tilt-card');
  tiltCards.forEach(card => {
    const icon = card.querySelector('.card-icon');
    const title = card.querySelector('.card-title');
    const desc = card.querySelector('.card-desc');
    const tags = card.querySelector('.card-tags');

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const xc = rect.width / 2;
      const yc = rect.height / 2;
      
      // Calculate rotation angles (-12 to 12 degrees)
      const rotateX = ((yc - y) / yc) * 12;
      const rotateY = ((x - xc) / xc) * 12;
      
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px)`;
      
      // Dynamic glare effect based on cursor position
      const glare = card.querySelector('.glare-effect');
      if (glare) {
        const percentageX = (x / rect.width) * 100;
        const percentageY = (y / rect.height) * 100;
        glare.style.background = `radial-gradient(circle at ${percentageX}% ${percentageY}%, rgba(255,255,255,0.15) 0%, transparent 60%)`;
      }

      // Holographic parallax depth translation
      if (icon) icon.style.transform = `translateZ(50px) translate(${rotateY * 0.7}px, ${-rotateX * 0.7}px)`;
      if (title) title.style.transform = `translateZ(40px) translate(${rotateY * 0.4}px, ${-rotateX * 0.4}px)`;
      if (desc) desc.style.transform = `translateZ(30px) translate(${rotateY * 0.2}px, ${-rotateX * 0.2}px)`;
      if (tags) tags.style.transform = `translateZ(25px) translate(${rotateY * 0.5}px, ${-rotateX * 0.5}px)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)';
      const glare = card.querySelector('.glare-effect');
      if (glare) {
        glare.style.background = 'transparent';
      }

      // Reset holographic depths
      if (icon) icon.style.transform = 'translateZ(30px) translate(0, 0)';
      if (title) title.style.transform = 'translateZ(40px) translate(0, 0)';
      if (desc) desc.style.transform = 'translateZ(25px) translate(0, 0)';
      if (tags) tags.style.transform = 'translateZ(20px) translate(0, 0)';
    });
  });

  // 3. Launch/Transition Action
  const triggerTransition = () => {
    // Check if user is logged in
    const currentUserId = Storage.getUserId();
    
    // Apply slide up transition class
    landingPage.classList.add('slide-up');
    
    setTimeout(() => {
      landingPage.style.display = 'none';
      
      if (currentUserId && currentUserId !== 'anonymous') {
        authScreen.style.display = 'none';
        appLayout.style.display = 'flex';
      } else {
        authScreen.style.display = 'flex';
        appLayout.style.display = 'none';
      }
    }, 800); // match CSS transition duration
  };

  if (enterBtn) enterBtn.addEventListener('click', triggerTransition);
  if (headerBtn) headerBtn.addEventListener('click', triggerTransition);

  // Check login state to update button text/style dynamically
  Supabase.onAuthStateChange((event, session) => {
    if (session && session.user) {
      if (enterBtn) {
        enterBtn.innerHTML = `<span>Launch Console</span> <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
        enterBtn.classList.add('logged-in-glow');
      }
      if (headerBtn) {
        headerBtn.textContent = 'Launch Console';
      }
    } else {
      if (enterBtn) {
        enterBtn.innerHTML = `<span>Get Started</span> <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
        enterBtn.classList.remove('logged-in-glow');
      }
      if (headerBtn) {
        headerBtn.textContent = 'Launch Console';
      }
    }
  });

  // 4. Hide "Built with Spline" watermark from Shadow DOM
  const splineViewer = document.querySelector('spline-viewer');
  if (splineViewer) {
    const hideSplineLogo = () => {
      if (splineViewer.shadowRoot) {
        const logo = splineViewer.shadowRoot.getElementById('logo');
        if (logo) {
          logo.style.display = 'none';
          return true; // successfully hidden
        }
      }
      return false;
    };

    // Run checks periodically until loaded
    if (!hideSplineLogo()) {
      const checkInterval = setInterval(() => {
        if (hideSplineLogo()) {
          clearInterval(checkInterval);
        }
      }, 100);
      
      // Stop checking after 10 seconds
      setTimeout(() => clearInterval(checkInterval), 10000);
    }
  }

  // 5. Scroll Forwarding: Prevent Spline container from blocking desktop mouse wheel scroll
  const splineContainer = document.querySelector('.robot-spline-container');
  if (splineContainer && landingPage) {
    splineContainer.addEventListener('wheel', (e) => {
      landingPage.scrollTop += e.deltaY;
    }, { passive: true });
  }

  // 6. SVG Scroll Drawing Initializer
  const pipelinePaths = document.querySelectorAll('.pipeline-line');
  pipelinePaths.forEach(path => {
    try {
      const length = path.getTotalLength();
      path.style.strokeDasharray = length;
      path.style.strokeDashoffset = length;
    } catch (e) {
      path.style.strokeDasharray = '500';
      path.style.strokeDashoffset = '500';
    }
  });

  // 7. Scroll Parallax, Progress & SVG Pipeline scroll-drawing
  if (landingPage) {
    const scrollProgress = document.getElementById('scrollProgress');
    const spline = document.querySelector('.robot-spline-container');
    const heroLeft = document.querySelector('.hero-left');
    const orb1 = document.querySelector('.orb-1');
    const orb2 = document.querySelector('.orb-2');
    const pipelineContainer = document.querySelector('.pipeline-container');

    landingPage.addEventListener('scroll', () => {
      const scrolled = landingPage.scrollTop;
      const scrollHeight = landingPage.scrollHeight - landingPage.clientHeight;

      // Update scroll progress bar width
      if (scrollHeight > 0 && scrollProgress) {
        const percent = (scrolled / scrollHeight) * 100;
        scrollProgress.style.width = `${percent}%`;
      }

      // Parallax shifts
      if (spline) {
        spline.style.transform = `translateY(${scrolled * 0.12}px) scale(${1 - (scrolled * 0.00015)})`;
      }
      if (heroLeft) {
        heroLeft.style.transform = `translateY(${scrolled * 0.05}px)`;
      }
      if (orb1) {
        orb1.style.transform = `translateY(${scrolled * 0.18}px)`;
      }
      if (orb2) {
        orb2.style.transform = `translateY(${scrolled * -0.15}px)`;
      }

      // Scroll-Linked SVG Connection Path Drawing
      if (pipelineContainer) {
        const rect = pipelineContainer.getBoundingClientRect();
        const viewHeight = window.innerHeight;
        
        const startPoint = viewHeight * 0.85;
        const endPoint = viewHeight * 0.25;
        
        let progress = (startPoint - rect.top) / (startPoint - endPoint);
        progress = Math.max(0, Math.min(1, progress)); // bound to 0..1
        
        pipelinePaths.forEach(path => {
          const dashArray = path.style.strokeDasharray;
          const numLength = parseFloat(dashArray) || 500;
          path.style.strokeDashoffset = numLength * (1 - progress);

          // Once fully drawn (95%+ scroll depth), trigger running data dots flowing animation
          if (progress > 0.95) {
            path.classList.add('flow-active');
          } else {
            path.classList.remove('flow-active');
          }
        });
      }
    });
  }

  // 8. Cybernetic Particle Canvas Background Engine
  const canvas = document.getElementById('cyberNetworkCanvas');
  if (canvas && landingPage) {
    const ctx = canvas.getContext('2d');
    let particles = [];
    let width = canvas.width = landingPage.clientWidth;
    let height = canvas.height = landingPage.scrollHeight;

    // Handle resizing of the container dynamically
    const resizeObserver = new ResizeObserver(() => {
      width = canvas.width = landingPage.clientWidth;
      height = canvas.height = landingPage.scrollHeight;
    });
    resizeObserver.observe(landingPage);

    // Particle Object Blueprint
    class Particle {
      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.baseVx = (Math.random() - 0.5) * 0.35;
        this.baseVy = (Math.random() - 0.5) * 0.35;
        this.vx = this.baseVx;
        this.vy = this.baseVy;
        this.radius = Math.random() * 1.5 + 1;
        this.color = Math.random() > 0.5 ? 'rgba(124, 58, 237, 0.35)' : 'rgba(6, 182, 212, 0.35)';
      }

      update(speedMultiplier) {
        this.vx = this.baseVx * speedMultiplier;
        this.vy = this.baseVy * speedMultiplier;
        
        this.x += this.vx;
        this.y += this.vy;

        // Wrap around boundaries
        if (this.x < 0) this.x = width;
        if (this.x > width) this.x = 0;
        if (this.y < 0) this.y = height;
        if (this.y > height) this.y = 0;
      }

      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
      }
    }

    // Populate particles base on page depth
    const count = Math.min(80, Math.floor(height / 45));
    for (let i = 0; i < count; i++) {
      particles.push(new Particle());
    }

    let scrollSpeedMultiplier = 1;
    let lastScrollTime = Date.now();
    let lastScrollTop = landingPage.scrollTop;

    // Track scroll velocity to animate nodes speed on scrolling
    landingPage.addEventListener('scroll', () => {
      const now = Date.now();
      const deltaT = Math.max(1, now - lastScrollTime);
      const scrollTop = landingPage.scrollTop;
      const deltaY = Math.abs(scrollTop - lastScrollTop);
      
      const speed = deltaY / deltaT;
      scrollSpeedMultiplier = 1 + (speed * 12);
      
      lastScrollTime = now;
      lastScrollTop = scrollTop;
    });

    // Run Render loop
    function animate() {
      ctx.clearRect(0, 0, width, height);
      
      // Decelerate speed multiplier back to baseline
      if (scrollSpeedMultiplier > 1) {
        scrollSpeedMultiplier -= 0.05;
      } else {
        scrollSpeedMultiplier = 1;
      }

      // Draw faint connections
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.lineWidth = 0.6;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Update and Draw nodes
      particles.forEach(p => {
        p.update(scrollSpeedMultiplier);
        p.draw();
      });

      requestAnimationFrame(animate);
    }

    animate();
  }

  // 9. Scroll Image Sequence Controller (Standalone Intro Page)
  const introContainer = document.getElementById('scrollSeqIntro');
  const seqCanvas = document.getElementById('scrollSeqCanvas');
  const seqIndicator = document.getElementById('scrollSeqIndicator');
  
  if (introContainer && seqCanvas) {
    const header = document.querySelector('.landing-header');
    
    // Check if user already saw the intro in this session
    if (sessionStorage.getItem('plural_intro_completed') === 'true') {
      introContainer.style.display = 'none';
      if (header) header.classList.add('visible');
    } else {
      const seqCtx = seqCanvas.getContext('2d');
      const totalFrames = 271;
      const seqImages = [];
      let activeFrame = 1;
      let isFadingOut = false;

      // Load first frame immediately
      const firstImg = new Image();
      firstImg.src = 'assets/scroll-sequence/ezgif-frame-001.jpg';
      firstImg.onload = () => {
        drawSeqFrame(firstImg);
      };

      function drawSeqFrame(img) {
        if (!img) return;

        // Set canvas size once on resize or initialization, not on every draw call to prevent resetting!
        if (seqCanvas.width !== window.innerWidth || seqCanvas.height !== window.innerHeight) {
          seqCanvas.width = window.innerWidth;
          seqCanvas.height = window.innerHeight;
        }

        const canvasWidth = seqCanvas.width;
        const canvasHeight = seqCanvas.height;

        // Draw keeping aspect ratio cover style
        const imgRatio = img.width / img.height;
        const canvasRatio = canvasWidth / canvasHeight;

        let drawWidth = canvasWidth;
        let drawHeight = canvasHeight;
        let xOffset = 0;
        let yOffset = 0;

        if (imgRatio > canvasRatio) {
          drawWidth = canvasHeight * imgRatio;
          xOffset = (canvasWidth - drawWidth) / 2;
        } else {
          drawHeight = canvasWidth / imgRatio;
          yOffset = (canvasHeight - drawHeight) / 2;
        }

        seqCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        seqCtx.drawImage(img, xOffset, yOffset, drawWidth, drawHeight);
      }

      // Format index to pad 3 digits
      const formatFrameName = (idx) => {
        return `assets/scroll-sequence/ezgif-frame-${String(idx).padStart(3, '0')}.jpg`;
      };

      // Preload remaining frames
      for (let i = 1; i <= totalFrames; i++) {
        const img = new Image();
        img.src = formatFrameName(i);
        seqImages.push(img);
      }

      // Handle scroll rendering
      introContainer.addEventListener('scroll', () => {
        const scrolled = introContainer.scrollTop;
        const maxScroll = introContainer.scrollHeight - window.innerHeight;
        
        if (maxScroll <= 0) return;

        const progress = Math.max(0, Math.min(1, scrolled / maxScroll));
        const frameIndex = Math.min(totalFrames, Math.max(1, Math.floor(progress * (totalFrames - 1)) + 1));
        activeFrame = frameIndex;

        // Render the current frame
        const targetImg = seqImages[frameIndex - 1];
        if (targetImg && targetImg.complete) {
          drawSeqFrame(targetImg);
        } else {
          if (targetImg) {
            targetImg.onload = () => {
              if (activeFrame === frameIndex) {
                drawSeqFrame(targetImg);
              }
            };
          }
        }

        // Fade out indicator
        if (frameIndex > 50) {
          seqIndicator.classList.add('fade-out');
        } else {
          seqIndicator.classList.remove('fade-out');
        }

        // If animation is complete (reaches frame 270/271), trigger landing reveal!
        if (frameIndex >= 270 && !isFadingOut) {
          isFadingOut = true;
          
          // Fade out intro screen
          introContainer.style.transition = 'opacity 1s cubic-bezier(0.16, 1, 0.3, 1), transform 1s cubic-bezier(0.16, 1, 0.3, 1)';
          introContainer.style.opacity = '0';
          introContainer.style.transform = 'scale(1.05)';
          
          // Show landing header
          if (header) header.classList.add('visible');

          setTimeout(() => {
            introContainer.style.display = 'none';
            sessionStorage.setItem('plural_intro_completed', 'true');
          }, 1000);
        }
      });

      window.addEventListener('resize', () => {
        const activeImg = seqImages[activeFrame - 1];
        if (activeImg) drawSeqFrame(activeImg);
      });
    }
  }
}
