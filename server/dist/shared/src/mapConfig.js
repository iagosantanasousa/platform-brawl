"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAP_CONFIGS = void 0;
// Game canvas is 960x540. Tile size is 32x32px — all platform widths/heights are multiples of 32.
exports.MAP_CONFIGS = {
    arena: {
        id: 'arena',
        label: 'Arena Aberta',
        width: 960,
        height: 540,
        backgroundColor: 0x1e2d3d,
        description: 'Arena aberta com plataformas em alturas diferentes.',
        spawnPoints: [
            { x: 160, y: 440 },
            { x: 800, y: 440 },
        ],
        platforms: [
            // Ground (2 tile rows, full width; bottom clips below canvas at y=572)
            { x: 0, y: 508, width: 960, height: 64 },
            // Left wall
            { x: 0, y: 0, width: 32, height: 544 },
            // Right wall
            { x: 928, y: 0, width: 32, height: 544 },
            // Center high platform
            { x: 384, y: 288, width: 192, height: 64 },
            // Left mid platform
            { x: 96, y: 384, width: 160, height: 64 },
            // Right mid platform
            { x: 704, y: 384, width: 160, height: 64 },
            // Left high platform
            { x: 64, y: 224, width: 128, height: 64 },
            // Right high platform
            { x: 800, y: 224, width: 128, height: 64 },
        ],
    },
    corridors: {
        id: 'corridors',
        label: 'Corredores',
        width: 960,
        height: 540,
        backgroundColor: 0x1a2530,
        description: 'Arena com corredores, obstáculos e plataformas menores.',
        spawnPoints: [
            { x: 140, y: 270 },
            { x: 820, y: 270 },
        ],
        platforms: [
            // Ground left (2 tile rows; bottom clips below canvas)
            { x: 0, y: 508, width: 320, height: 64 },
            // Ground right
            { x: 640, y: 508, width: 320, height: 64 },
            // Left wall
            { x: 0, y: 0, width: 32, height: 544 },
            // Right wall
            { x: 928, y: 0, width: 32, height: 544 },
            // Center pillar (4×4 tiles — wallable)
            { x: 416, y: 384, width: 128, height: 128 },
            // Mid-level left
            { x: 64, y: 320, width: 192, height: 64 },
            // Mid-level right
            { x: 704, y: 320, width: 192, height: 64 },
            // Upper left
            { x: 32, y: 192, width: 128, height: 64 },
            // Upper right
            { x: 800, y: 192, width: 128, height: 64 },
            // Upper center left
            { x: 288, y: 240, width: 128, height: 64 },
            // Upper center right
            { x: 544, y: 240, width: 128, height: 64 },
            // Top center bridge
            { x: 384, y: 144, width: 192, height: 64 },
        ],
    },
};
