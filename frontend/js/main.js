/* PUSEWU homepage scripts */
const slides=[...document.querySelectorAll('.slide')];
const dots=[...document.querySelectorAll('.dot')];
let idx=0,timer=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const INTERVAL=6500;
function show(n){
  slides[idx].classList.remove('active');dots[idx].classList.remove('active');
  dots[idx].setAttribute('aria-selected','false');
  idx=(n+slides.length)%slides.length;
  slides[idx].classList.add('active');
  const d=dots[idx];d.classList.remove('active');void d.offsetWidth;d.classList.add('active');
  d.setAttribute('aria-selected','true');
}
function next(){show(idx+1);restart();}
function prev(){show(idx-1);restart();}
function goTo(n){show(n);restart();}
function restart(){if(reduced)return;clearInterval(timer);timer=setInterval(()=>show(idx+1),INTERVAL);}
if(!reduced){timer=setInterval(()=>show(idx+1),INTERVAL);}
const hero=document.querySelector('.hero');
if(hero){
  hero.addEventListener('mouseenter',()=>clearInterval(timer));
  hero.addEventListener('mouseleave',restart);
  hero.addEventListener('focusin',()=>clearInterval(timer));
  hero.addEventListener('focusout',restart);
  let sx=null;
  hero.addEventListener('touchstart',e=>{sx=e.touches[0].clientX},{passive:true});
  hero.addEventListener('touchend',e=>{if(sx===null)return;const dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>50){dx<0?next():prev();}sx=null;},{passive:true});
}
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')next();if(e.key==='ArrowLeft')prev();});
const counter=document.querySelector('[data-count]');
if(counter&&!reduced){
  const target=+counter.dataset.count;let cur=0;
  const io=new IntersectionObserver(es=>{
    if(es[0].isIntersecting){
      const t=setInterval(()=>{cur+=Math.ceil(target/60);if(cur>=target){cur=target;clearInterval(t);}counter.textContent=cur.toLocaleString()+'+';},20);
      io.disconnect();
    }
  });
  io.observe(counter);
}else if(counter){counter.textContent=(+counter.dataset.count).toLocaleString()+'+';}
function toggleMenu(btn){const nav=document.getElementById('navlinks');const open=nav.classList.toggle('open');btn.setAttribute('aria-expanded',open);}
