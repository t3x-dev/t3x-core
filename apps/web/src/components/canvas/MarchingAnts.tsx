'use client';

interface MarchingAntsProps {
  width: number;
  height: number;
  borderRadius: number;
  color?: string;
  active?: boolean;
}

export function MarchingAnts({
  width,
  height,
  borderRadius: r,
  color = '#f97316', // orange-500
  active = true,
}: MarchingAntsProps) {
  if (!active) return null;

  const path = [
    `M ${r} 0`,
    `H ${width - r}`,
    `A ${r} ${r} 0 0 1 ${width} ${r}`,
    `V ${height - r}`,
    `A ${r} ${r} 0 0 1 ${width - r} ${height}`,
    `H ${r}`,
    `A ${r} ${r} 0 0 1 0 ${height - r}`,
    `V ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    'Z',
  ].join(' ');

  return (
    <svg
      width={width}
      height={height}
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 1 }}
    >
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray="8 4"
        className="marching-ants"
      />
    </svg>
  );
}
