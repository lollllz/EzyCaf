interface Props {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}

export default function QtyStepper({ value, onChange, min = 0, max = 99 }: Props) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-white">
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center text-lg font-semibold text-ink"
        aria-label="Decrease"
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <span className="min-w-[2ch] text-center text-base font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center text-lg font-semibold text-ink"
        aria-label="Increase"
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </div>
  );
}
