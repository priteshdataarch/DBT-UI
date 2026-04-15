'use client';

import { useRef, useEffect } from 'react';

interface Props {
  direction: 'horizontal' | 'vertical';
  onDelta: (delta: number) => void;
}

export default function ResizeHandle({ direction, onDelta }: Props) {
  // Keep onDelta in a ref so our stable event listeners never need to be re-created
  const onDeltaRef = useRef(onDelta);
  useEffect(() => { onDeltaRef.current = onDelta; });

  const dragging = useRef(false);
  const lastPos = useRef(0);
  const isH = direction === 'horizontal';

  // These handlers are created once on mount and never change
  const handleMove = useRef((e: MouseEvent) => {
    if (!dragging.current) return;
    const pos = isH ? e.clientX : e.clientY;
    onDeltaRef.current(pos - lastPos.current);
    lastPos.current = pos;
  });

  const handleUp = useRef(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', handleMove.current);
    window.removeEventListener('mouseup', handleUp.current);
  });

  // Register/unregister stable handlers only once
  useEffect(() => {
    const move = handleMove.current;
    const up = handleUp.current;
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastPos.current = isH ? e.clientX : e.clientY;
    document.body.style.cursor = isH ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMove.current);
    window.addEventListener('mouseup', handleUp.current);
  };

  return (
    <div
      onMouseDown={onMouseDown}
      className={`shrink-0 group relative z-10 ${
        isH
          ? 'w-[3px] cursor-col-resize hover:bg-[#007acc] transition-colors'
          : 'h-[3px] w-full cursor-row-resize hover:bg-[#007acc] transition-colors'
      } bg-[#3e3e42]`}
    />
  );
}
