import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { 'tenant-slug': string } }
) {
  const slug = params['tenant-slug'];
  
  // Clean dynamic js code
  const jsCode = `
(function() {
  // 1. Create wrapper container
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.bottom = '20px';
  container.style.right = '20px';
  container.style.zIndex = '999999';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'flex-end';
  container.style.gap = '10px';
  container.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  document.body.appendChild(container);

  // 2. Load Google Material Icons
  const link = document.createElement('link');
  link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@400,0..1';
  link.rel = 'stylesheet';
  document.head.appendChild(link);

  // 3. Create IFrame widget
  const iframe = document.createElement('iframe');
  iframe.src = 'http://localhost:3000/${slug}/chat?embed=true';
  iframe.style.width = '380px';
  iframe.style.height = '580px';
  iframe.style.border = 'none';
  iframe.style.borderRadius = '16px';
  iframe.style.boxShadow = '0px 20px 50px rgba(15, 23, 42, 0.15)';
  iframe.style.display = 'none';
  iframe.style.background = 'white';
  iframe.style.overflow = 'hidden';
  iframe.style.transition = 'all 0.3s ease';
  container.appendChild(iframe);

  // 4. Create FAB toggle button
  const fab = document.createElement('button');
  fab.style.width = '56px';
  fab.style.height = '56px';
  fab.style.borderRadius = '50%';
  fab.style.border = 'none';
  fab.style.backgroundColor = '#004ac6'; // Default brand fallback, overridden by iframe settings if needed
  fab.style.color = 'white';
  fab.style.cursor = 'pointer';
  fab.style.display = 'flex';
  fab.style.alignItems = 'center';
  fab.style.justifyContent = 'center';
  fab.style.boxShadow = '0px 10px 25px rgba(0, 0, 0, 0.15)';
  fab.style.outline = 'none';
  fab.style.transition = 'transform 0.2s ease, background-color 0.2s ease';
  
  const icon = document.createElement('span');
  icon.className = 'material-symbols-outlined';
  icon.textContent = 'chat';
  icon.style.fontSize = '28px';
  fab.appendChild(icon);
  container.appendChild(fab);

  // Hover states
  fab.addEventListener('mouseenter', () => {
    fab.style.transform = 'scale(1.05)';
  });
  fab.addEventListener('mouseleave', () => {
    fab.style.transform = 'scale(1)';
  });

  // Toggle open state
  let isOpen = false;
  fab.addEventListener('click', () => {
    isOpen = !isOpen;
    if (isOpen) {
      iframe.style.display = 'block';
      icon.textContent = 'close';
    } else {
      iframe.style.display = 'none';
      icon.textContent = 'chat';
    }
  });

  // Optional: Listen to brand customization from the iframe window context
  window.addEventListener('message', (event) => {
    if (event.origin !== 'http://localhost:3000') return;
    if (event.data && event.data.type === 'SET_BRAND_COLOR') {
      fab.style.backgroundColor = event.data.color;
    }
  });
})();
  `;

  return new NextResponse(jsCode, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
