'use strict';

const DEFAULT_LANG = 'en';

// Add a language by dropping a locale file into /locales and listing it here.
const locales = Object.freeze({
  en: require('../../locales/en.json'),
  fr: require('../../locales/fr.json'),
});

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/** Unsupported or missing language codes fall back to English instead of failing. */
const resolveLang = (requested) =>
  typeof requested === 'string' && Object.hasOwn(locales, requested) ? requested : DEFAULT_LANG;

const renderFeedbackPage = (requestedLang, today = new Date()) => {
  const lang = resolveLang(requestedLang);
  const text = locales[lang];
  const formattedDate = new Intl.DateTimeFormat(lang, { dateStyle: 'full' }).format(today);

  const questions = text.questions
    .map(
      (question, index) => `
      <label for="q${index + 1}">${index + 1}. ${escapeHtml(question)}</label>
      <textarea id="q${index + 1}" name="q${index + 1}" rows="5" required>${escapeHtml(text.answers[index])}</textarea>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(text.htmlLang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(text.title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    label { display: block; margin-top: 1.25rem; font-weight: 600; }
    textarea { width: 100%; margin-top: 0.4rem; padding: 0.5rem; font: inherit; box-sizing: border-box; }
    button { margin-top: 1.5rem; padding: 0.6rem 1.2rem; font: inherit; }
    .lang a { margin-right: 0.5rem; }
  </style>
</head>
<body>
  <p class="lang"><a href="?lang=en">English</a><a href="?lang=fr">Français</a></p>
  <h1>${escapeHtml(text.title)}</h1>
  <p>${escapeHtml(text.dateLabel)}: <time datetime="${today.toISOString().slice(0, 10)}">${escapeHtml(formattedDate)}</time></p>
  <p>${escapeHtml(text.instructions)}</p>
  <form id="feedback-form">
${questions}
    <button type="submit">${escapeHtml(text.submit)}</button>
  </form>
  <p id="thanks" hidden>${escapeHtml(text.thanks)}</p>
  <script>
    document.getElementById('feedback-form').addEventListener('submit', function (event) {
      event.preventDefault();
      this.hidden = true;
      document.getElementById('thanks').hidden = false;
    });
  </script>
</body>
</html>`;
};

module.exports = { renderFeedbackPage, resolveLang };
