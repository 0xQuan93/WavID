import React from 'react';
export function Icon({name,size=18,...rest}) {
  const paths={
    search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
    arrow:<path d="M6 18 18 6M6 6h12v12"/>,
    download:<><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
    upload:<><path d="M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4"/></>,
    refresh:<><path d="M20 10a8 8 0 0 0-14-4L3 9m0-6v6h6M4 14a8 8 0 0 0 14 4l3-3m0 6v-6h-6"/></>,
    play:<path d="m8 5 11 7-11 7Z"/>,pause:<><path d="M8 5v14M16 5v14"/></>,
    focus:<><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/></>,
    close:<path d="m6 6 12 12M6 18 18 6"/>,
    copy:<><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>,
    check:<path d="m5 12 4 4L19 6"/>,
    layers:<><path d="m3 8 9-5 9 5-9 5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
    history:<><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/><path d="M12 7v6l4 2"/></>,
    source:<><path d="M12 3 3 7v6c0 4 9 8 9 8s9-4 9-8V7Z"/><path d="m8 12 3 3 5-6"/></>,
    reset:<><path d="M5 5v14M19 5l-10 7 10 7Z"/></>,
    kit:<><path d="m3 7 9-4 9 4v11l-9 4-9-4Z"/><path d="m3 7 9 5 9-5M12 12v10M8 5l9 5"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>{paths[name]||paths.arrow}</svg>;
}
export function Mark(){return <svg className="mark" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M3 21h6l4-13 7 25 6-23 4 11h7" stroke="currentColor" strokeWidth="1.7"/><circle cx="20" cy="20" r="18" stroke="currentColor" opacity=".3"/></svg>;}
