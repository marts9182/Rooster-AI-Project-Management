import { useState } from 'react';
import HelpDrawer from './HelpDrawer';

interface Props {
  /** Help topic field name, e.g. 'asin'. */
  field: string;
  /** Optional ARIA label override. Defaults to `Help for ${field}`. */
  ariaLabel?: string;
}

/**
 * Small `?` button rendered next to a form field. Clicking it opens a
 * `<HelpDrawer>` showing the article for the matching field. The drawer
 * state is self-contained.
 */
export default function HelpIcon({ field, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="help-icon"
        aria-label={ariaLabel ?? `Help for ${field}`}
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      <HelpDrawer
        field={field}
        isOpen={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

export { HelpIcon };
