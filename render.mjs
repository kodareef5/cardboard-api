import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { renderAsync, forPlayer, playerRequests, playerFilename } from './tabletop.mjs';

try {
  const { values } = parseArgs({
    options: {
      config: { type: 'string', short: 'c' },
      output: { type: 'string', short: 'o' },
      player: { type: 'string' },
      'all-players': { type: 'boolean' },
      scope: { type: 'string', default: 'table' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(
      'Usage: node render.mjs --config scene.json --output scene.svg\n' +
        '       node render.mjs --player p2 --scope self --output player.svg\n' +
        '       node render.mjs --all-players --scope both --output player-images\n' +
        'Omit --config for the default table. SVG needs only Node; export PNG in the browser.',
    );
  } else {
    if (values.player && values['all-players'])
      throw new Error('Choose --player or --all-players.');
    const config = values.config ? JSON.parse(await readFile(values.config, 'utf8')) : {};
    if (values['all-players']) {
      const output = values.output || 'player-images';
      const requests = playerRequests(config, { scope: values.scope });
      const images = [];
      // Resolve all images successfully before creating the output batch.
      for (const { state, ...request } of requests)
        images.push({
          ...request,
          filename: playerFilename(state, request.playerId, request.scope, 'svg'),
          svg: await renderAsync(state),
          width: state.stage.width,
          height: state.stage.height,
        });
      await mkdir(output, { recursive: true });
      for (const image of images)
        await writeFile(join(output, image.filename), image.svg, 'utf8');
      const manifest = images.map(({ svg, ...image }) => image);
      await writeFile(
        join(output, 'manifest.json'),
        JSON.stringify({ version: 1, images: manifest }, null, 2),
      );
      console.log(`Rendered ${images.length} player images in ${output}`);
    } else {
      const output = values.output || 'scene.svg';
      if (!output.toLowerCase().endsWith('.svg'))
        throw new Error(
          'The native CLI writes SVG. Use a .svg filename, or export PNG from the studio/browser API.',
        );
      const svg = await renderAsync(
        values.player ? forPlayer(config, values.player, { scope: values.scope }) : config,
      );
      await writeFile(output, svg, 'utf8');
      console.log(`Rendered ${output}`);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
