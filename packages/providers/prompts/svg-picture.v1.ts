// Картинка для варианта ответа квиза, если подходящего эмодзи нет (п. 7.2 ТЗ).

export const SVG_PICTURE_VERSION = 'svg-picture.v1';

export function svgPicturePrompt(picture: string): string {
  return `Нарисуй простую детскую картинку в формате SVG: ${picture}.

Требования:
- корневой элемент <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">;
- только фигуры: path, circle, ellipse, rect, line, polyline, polygon, g; можно linearGradient/radialGradient;
- никакого текста, букв и цифр (кроме случая, когда нарисовать нужно именно цифру или букву — тогда path), никаких <text>, <image>, <style>, <script>, ссылок;
- яркие чистые цвета, толстые контуры, крупно по центру, понятно ребёнку 2–6 лет с первого взгляда;
- до 40 элементов.

Ответ — только JSON по схеме: {"svg": "<svg ...>...</svg>"}.`;
}
