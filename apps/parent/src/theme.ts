// Aurora / Midnight: спокойные поверхности и читаемый текст.
import { createTheme, type MantineColorsTuple } from '@mantine/core';

const aurora: MantineColorsTuple = [
  '#f0f2ff',
  '#e0e5fa',
  '#c7d7f8',
  '#a3c4fb',
  '#8eaceb',
  '#5263d9',
  '#4555c5',
  '#3948ac',
  '#303e91',
  '#283578',
];

export const theme = createTheme({
  fontFamily: "'Onest', -apple-system, system-ui, sans-serif",
  headings: { fontFamily: "'Onest', -apple-system, system-ui, sans-serif", fontWeight: '600' },
  primaryColor: 'ios',
  primaryShade: { light: 5, dark: 3 },
  colors: { ios: aurora },
  autoContrast: true,
  fontSizes: { xs: '14px', sm: '14px', md: '16px', lg: '18px', xl: '20px' },
  defaultRadius: 'md',
  radius: { xs: '6px', sm: '8px', md: '12px', lg: '18px', xl: '24px' },
  components: {
    Card: { defaultProps: { radius: 'xl', padding: 'lg', shadow: 'none' } },
    Paper: { defaultProps: { radius: 'xl' } },
    Button: { defaultProps: { radius: 'md' } },
    Badge: { defaultProps: { radius: 'xl', variant: 'light' } },
    Modal: { defaultProps: { radius: 'xl', centered: true } },
    TextInput: { defaultProps: { radius: 'md' } },
    PasswordInput: { defaultProps: { radius: 'md' } },
    Select: { defaultProps: { radius: 'md' } },
    SegmentedControl: { defaultProps: { radius: 'md' } },
    Alert: { defaultProps: { radius: 'lg' } },
  },
});
