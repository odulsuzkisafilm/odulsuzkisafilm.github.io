// Load header and footer includes
document.addEventListener('DOMContentLoaded', function() {
  // Load navigation
  const navPlaceholder = document.getElementById('nav-placeholder');
  if (navPlaceholder) {
    fetch('includes/nav.html')
      .then(response => response.text())
      .then(data => {
        navPlaceholder.outerHTML = data;
      })
      .catch(error => console.error('Error loading navigation:', error));
  }
  
  // Load footer
  const footerPlaceholder = document.getElementById('footer-placeholder');
  if (footerPlaceholder) {
    fetch('includes/footer.html')
      .then(response => response.text())
      .then(data => {
        footerPlaceholder.outerHTML = data;
        // Re-run main.js initialization after footer loads
        if (typeof initMainJS === 'function') {
          initMainJS();
        }
      })
      .catch(error => console.error('Error loading footer:', error));
  }
});

// Make main.js functions available globally
window.initMainJS = function() {
  // Mobile menu toggle
  const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
  const navMenu = document.querySelector('.nav-menu');
  
  if (mobileMenuToggle && navMenu) {
    mobileMenuToggle.addEventListener('click', function() {
      navMenu.classList.toggle('active');
      
      const icon = this.querySelector('span');
      if (icon) {
        icon.textContent = navMenu.classList.contains('active') ? '✕' : '☰';
      }
    });
  }
  
  // Close mobile menu when clicking outside
  document.addEventListener('click', function(event) {
    if (navMenu && !event.target.closest('nav')) {
      navMenu.classList.remove('active');
      const icon = mobileMenuToggle?.querySelector('span');
      if (icon) icon.textContent = '☰';
    }
  });
  
  // Highlight active navigation link
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const navLinks = document.querySelectorAll('.nav-menu a');
  
  navLinks.forEach(link => {
    const linkPage = link.getAttribute('href');
    if (linkPage === currentPage || 
        (currentPage === '' && linkPage === 'index.html') ||
        (currentPage === 'index.html' && linkPage === 'index.html')) {
      link.classList.add('active');
    }
  });
  
  // Add current year to footer
  const yearElement = document.querySelector('.current-year');
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }
};

