import { cva, type VariantProps } from 'class-variance-authority';

export const button = cva(
  'inline-flex items-center justify-center rounded-lg text-sm font-semibold transition focus:outline-none disabled:opacity-60',
  {
    variants: {
      variant: {
        primary: 'bg-brand-600 text-white hover:bg-brand-700',
        secondary:
          'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100',
        danger: 'bg-red-600 text-white hover:bg-red-700',
      },
      size: {
        sm: 'px-3 py-1.5',
        md: 'px-5 py-2.5',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonVariants = VariantProps<typeof button>;
