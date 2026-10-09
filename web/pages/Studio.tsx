import { useEffect } from 'react';
import { BRAND } from '../brand/config.ts';
import { QuickDub } from '../components/QuickDub.tsx';
import { useCapabilities } from '../lib/hooks.ts';
import { SiteFooter, SiteNav } from './Landing.tsx';

export function Studio() {
  const { caps, error } = useCapabilities();
  useEffect(() => {
    document.title = `Studio — ${BRAND.name}`;
  }, []);
  return (
    <>
      <SiteNav />
      <main id="main" className="studio">
        <div className="wrap studio__wrap">
          <h1 className="studio__h">The studio</h1>
          <p className="lede studio__lede">Record yourself, pick an accent, download your new version.</p>
          <QuickDub caps={caps} capsError={error} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
