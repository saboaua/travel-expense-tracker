// Lets `next build` run with no internet: stands in for the Google Fonts answer (used only by tests/e2e/build-prod.sh)
const face = (family, weight) => `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:local('Arial');}`;
module.exports = {
  "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap": face("Inter", "100 900"),
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&display=swap": face("Bricolage Grotesque", "600 800"),
  "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap": face("Figtree", "400 700"),
};
