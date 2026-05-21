import { VisuallyHidden } from "./VisuallyHidden";

type Props = {
  label?: string;
};

export function LiveBadge({ label = "Live" }: Props) {
  return (
    <span className="inline-flex items-center">
      <span aria-hidden="true" className="live-dot" />
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}
