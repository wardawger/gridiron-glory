interface Props {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  // Accessible name. Describe the setting ("Bench enabled"), not the action.
  label: string;
  id?: string;
}

// Switch control. The visual is 40×20; an invisible ::after pseudo-element
// extends the hit area to ~56×36 so it meets touch-target minimums without
// changing the layout around it.
export function Toggle({ checked, onChange, disabled, label, id }: Props) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      onClick={onChange}
      disabled={disabled}
      aria-label={label}
      aria-checked={checked}
      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 after:absolute after:-inset-2 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-turf-900 focus-visible:ring-field-400 ${
        checked ? 'bg-field-500' : 'bg-turf-700'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-[left] motion-reduce:transition-none ${checked ? 'left-5' : 'left-0.5'}`} />
    </button>
  );
}
