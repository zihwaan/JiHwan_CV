window.addEventListener('DOMContentLoaded', event => {

    // Navbar shrink function
    var navbarShrink = function () {
        const navbarCollapsible = document.body.querySelector('#mainNav');
        if (!navbarCollapsible) {
            return;
        }
        if (window.scrollY === 0) {
            navbarCollapsible.classList.remove('navbar-shrink')
        } else {
            navbarCollapsible.classList.add('navbar-shrink')
        }

    };

    // Shrink the navbar 
    navbarShrink();

    // Shrink the navbar when page is scrolled
    document.addEventListener('scroll', navbarShrink);

    // Activate Bootstrap scrollspy on the main nav element
    const mainNav = document.body.querySelector('#mainNav');
    if (mainNav) {
        new bootstrap.ScrollSpy(document.body, {
            target: '#mainNav',
            offset: 72,
        });
    };

    // Collapse responsive navbar when toggler is visible
    const navbarToggler = document.body.querySelector('.navbar-toggler');
    const responsiveNavItems = [].slice.call(
        document.querySelectorAll('#navbarResponsive .nav-link')
    );
    responsiveNavItems.map(function (responsiveNavItem) {
        responsiveNavItem.addEventListener('click', () => {
            if (window.getComputedStyle(navbarToggler).display !== 'none') {
                navbarToggler.click();
            }
        });
    });

    // Easter Egg Logic
    const profilePhoto = document.getElementById('profile-photo');
    if (profilePhoto) {
        let clickCount = 0;
        let clickTimer;

        profilePhoto.addEventListener('click', function() {
            clickCount++;
            
            // Reset count if clicks are too far apart (e.g., 2 seconds)
            clearTimeout(clickTimer);
            clickTimer = setTimeout(() => {
                clickCount = 0;
            }, 2000);

            if (clickCount > 15) {
                const easterEggModal = new bootstrap.Modal(document.getElementById('easterEggModal'));
                easterEggModal.show();
                clickCount = 0; // Reset after trigger
                clearTimeout(clickTimer);
            }
        });
    }

});

gsap.registerPlugin(ScrollTrigger);

Number.prototype.numberFormat = function(decimals, dec_point, thousands_sep) {
    dec_point = typeof dec_point !== 'undefined' ? dec_point : '.';
    thousands_sep = typeof thousands_sep !== 'undefined' ? thousands_sep : ',';

    var parts = this.toFixed(decimals).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousands_sep);

    return parts.join(dec_point);
}

var startCount = {var: 0};

gsap.to(startCount, {
  var: 51950000, duration: 3, ease:"none",
  onUpdate: changeNumber,
  scrollTrigger: {
    trigger: "#number",
  },
})

function changeNumber() {
  number.innerHTML = ((startCount.var.numberFormat(0)) + "원");
}


