import typescript from 'rollup-plugin-typescript2';
import commonjs from 'rollup-plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { babel } from '@rollup/plugin-babel';
import postcss from 'rollup-plugin-postcss';
import postcssPresetEnv from 'postcss-preset-env';
import postcssLit from 'rollup-plugin-postcss-lit';
import { description, repository, name } from './package.json';

export function logCardInfo(version) {
  const part1 = `📍 ${name.toUpperCase()} 🗺️`;
  const part2 = `${version}`;
  const part1Style =
    'background-color: #434347;color: #fff;padding: 2px 4px;border: 1px solid #434347;border-radius: 2px 0 0 2px;font-family: Roboto,Verdana,Geneva,sans-serif;text-shadow: 0 1px 0 rgba(1, 1, 1, 0.3)';
  const part2Style =
    'background-color: transparent;color: #434347;padding: 2px 3px;border: 1px solid #434347; border-radius: 0 2px 2px 0;font-family: Roboto,Verdana,Geneva,sans-serif';
  const repo = `Github: ${repository.url}`;
  const sponsor = 'If you like the card, consider supporting the developer: https://github.com/sponsors/ngocjohn';

  return `
    console.groupCollapsed(
      "%c${part1}%c${part2}",
      '${part1Style}',
      '${part2Style}',
    );
    console.info('${description}');
    console.info('${repo}');
    console.info('${sponsor}');
    console.groupEnd();
  `;
}

export const defaultPlugins = [
  nodeResolve({ preferBuiltins: false }),
  commonjs(),
  babel({
    babelHelpers: 'bundled',
    exclude: 'node_modules/**',
  }),
  postcss({
    plugins: [
      postcssPresetEnv({
        stage: 1,
        features: {
          'nesting-rules': true,
        },
      }),
    ],
    extract: false,
    inject: false,
  }),
  postcssLit(),
  typescript(),
];
