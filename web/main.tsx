import { createRoot } from 'react-dom/client';
import { BRAND } from './brand/config.ts';
import { Landing, SiteFooter, SiteNav } from './pages/Landing.tsx';
import { Studio } from './pages/Studio.tsx';
import { Link, usePath } from './router.tsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/landing.css';
import './styles/studio.css';

function NotFound() {
  return (
    <>
      <SiteNav />
      <main id="main" className="wrap notfound">
        <h1 className="h2">Wrong postcode.</h1>
        <p className="lede">There’s nothing at this address.</p>
        <Link to="/" className="btn btn--ink">
          Back to {BRAND.name}
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}

function App() {
  const path = usePath();
  if (path === '/' || path === '/index.html') return <Landing />;
  if (path === BRAND.studioPath || path === BRAND.studioPath + '/') return <Studio />;
  return <NotFound />;
}

createRoot(document.getElementById('root')!).render(<App />);
