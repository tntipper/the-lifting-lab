export default function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const cls =
    size === 'lg'
      ? 'text-3xl'
      : size === 'sm'
        ? 'text-base'
        : 'text-xl'
  return (
    <span className={`font-black uppercase tracking-widest ${cls}`}>
      THE LIFTING<span className="text-lab-lime">LAB</span>
    </span>
  )
}
