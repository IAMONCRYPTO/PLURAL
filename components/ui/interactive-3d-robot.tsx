'use client';

import { Suspense, lazy } from 'react';
const Spline = lazy(() => import('@splinetool/react-spline'));

export function InteractiveRobot() {
  return (
    <div className="w-full h-full min-h-[400px] flex items-center justify-center relative bg-transparent overflow-hidden">
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center gap-4 text-muted-foreground animate-pulse">
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="text-sm font-medium">Booting Whobee...</p>
        </div>
      }>
        <Spline scene="https://prod.spline.design/PyzDhpQ9E5f1E3MT/scene.splinecode" eventsTarget="global" className="w-full h-full object-cover" />
      </Suspense>
    </div>
  );
}
