export function initSwiper() {
    const swiper = new window.Swiper(".mySwiper", {
        speed: 600,
        effect: 'slide',
        loop: true,
        centeredSlides: true,
        slidesPerView: 1,
        spaceBetween: 30,
        pagination: {
            el: ".swiper-pagination",
            clickable: true,
        },
        navigation: {
            nextEl: ".swiper-button-next",
            prevEl: ".swiper-button-prev",
        },
        autoplay: {
            delay: 5000,
            disableOnInteraction: false,
        },
    });
    
    return swiper;
}