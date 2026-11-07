// Lets `next build` run with no internet: stands in for the Google Fonts answer (used only by tests/e2e/build-prod.sh)
module.exports = {
  "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap": "@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;src:local('Arial');}",
};
