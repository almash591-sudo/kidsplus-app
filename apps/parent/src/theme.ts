// Тема кабинета (этап 12б): в духе iOS — шрифт Onest, синий iPhone, крупные заголовки,
// сгруппированные белые блоки на сером фоне; ночью — чёрный фон и графитовые блоки.
import { createTheme, type MantineColorsTuple } from '@mantine/core';

/** Синий iOS (#007aff) — оттенки от светлого к тёмному. */
const iosBlue: MantineColorsTuple = [
  '#e6f2ff',
  '#cce4ff',
  '#99caff',
  '#66afff',
  '#3395ff',
  '#007aff',
  '#0062cc',
  '#004a99',
  '#003166',
  '#001933',
];

export const theme = createTheme({
  fontFamily: "'Onest', -apple-system, system-ui, sans-serif",
  headings: { fontFamily: "'Onest', -apple-system, system-ui, sans-serif", fontWeight: '800' },
  primaryColor: 'ios',
  primaryShade: { light: 5, dark: 4 },
  colors: { ios: iosBlue },
  defaultRadius: 'md',
  radius: { xs: '6px', sm: '8px', md: '12px', lg: '18px', xl: '22px' },
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
