# Some things to keep in mind

Developing in node is doable, but will require some setup (also your api key will be exposed as it is client side).

1. `npm install browserify`
2. `npx browserify openai.js -o bundle.js`

This will create a bundle.js file that you can include in your html in a script tag.
