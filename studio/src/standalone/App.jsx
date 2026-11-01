import React, { useEffect, useState } from 'react';
import { CardResolve } from '../card/CardResolve';
import { CardScan } from '../card/CardScan';
import { parseCardRoute, studioHashFor } from '../card/payload.mjs';
import { WavIdStudio } from '../studio/WavIdStudio';

export function StandaloneApp({ fixtureBaseUrl }) {
  const [route, setRoute] = useState(() => parseCardRoute(window.location.hash));

  useEffect(() => {
    const sync = () => setRoute(parseCardRoute(window.location.hash));
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  function go(next) {
    const hash = studioHashFor(next);
    if (window.location.hash === hash) setRoute(parseCardRoute(hash));
    else window.location.hash = hash;
  }

  if (route.name === 'scan') {
    return <CardScan onResolve={(decoded) => go({ name: 'card', handle: decoded.handle })} onStudio={() => go({ name: 'studio' })} />;
  }
  if (route.name === 'card') {
    return <CardResolve
      handle={route.ok ? route.handle : ''}
      blockedReason={route.ok ? '' : route.reason}
      fixtureBaseUrl={fixtureBaseUrl}
      onScan={() => go({ name: 'scan' })}
      onStudio={() => go({ name: 'studio' })}
    />;
  }
  return <WavIdStudio fixtureBaseUrl={fixtureBaseUrl} onOpenScan={() => go({ name: 'scan' })} />;
}
