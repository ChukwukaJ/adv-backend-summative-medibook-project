'use strict';

const { renderFeedbackPage, resolveLang } = require('../src/services/feedbackPage');

const fixedDay = new Date(2026, 11, 25, 12, 0, 0);
const countOccurrences = (text, fragment) => text.split(fragment).length - 1;

describe('feedback page i18n', () => {
  test('renders exactly five textareas', () => {
    expect(countOccurrences(renderFeedbackPage('en', fixedDay), '<textarea')).toBe(5);
    expect(countOccurrences(renderFeedbackPage('fr', fixedDay), '<textarea')).toBe(5);
  });

  test('every question comes with an answer, and the answers change with the language', () => {
    const english = renderFeedbackPage('en', fixedDay);
    const french = renderFeedbackPage('fr', fixedDay);
    ['en', 'fr'].forEach((lang) => {
      const answers = require(`../locales/${lang}.json`).answers;
      expect(answers).toHaveLength(5);
      answers.forEach((answer) => expect(answer.trim().length).toBeGreaterThan(40));
    });
    expect(english).toContain('concurrency in the booking flow');
    expect(french).toContain('gestion de la concurrence');
    expect(french).not.toContain('concurrency in the booking flow');
  });

  test('loads the French strings and formats the date for the French locale', () => {
    const html = renderFeedbackPage('fr', fixedDay);
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('Évaluation du cours');
    expect(html).toContain('25 décembre 2026');
  });

  test('defaults to English and formats the date for the English locale', () => {
    const html = renderFeedbackPage(undefined, fixedDay);
    expect(html).toContain('<title>Course Feedback</title>');
    expect(html).toContain('December 25, 2026');
  });

  test('unsupported or hostile lang values fall back to English instead of crashing', () => {
    ['de', '', '__proto__', 'constructor', ['fr'], 42].forEach((lang) => {
      expect(resolveLang(lang)).toBe('en');
    });
    expect(renderFeedbackPage('xx', fixedDay)).toContain('Course Feedback');
  });
});
