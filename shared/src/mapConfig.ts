import type { MapId } from './types';

export interface PlatformDef {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpawnPoint {
  x: number;
  y: number;
}

export interface MapConfig {
  id: MapId;
  label: string;
  width: number;
  height: number;
  backgroundColor: number;
  platforms: PlatformDef[];
  spawnPoints: SpawnPoint[];
  description: string;
}

// Game canvas is 960x540. Tile size is 32x32px — all platform widths/heights are multiples of 32.
export const MAP_CONFIGS: Record<MapId, MapConfig> = {
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
      { x: 0,   y: 508, width: 960, height: 64 },
      // Left wall
      { x: 0,   y: 0,   width: 32,  height: 544 },
      // Right wall
      { x: 928, y: 0,   width: 32,  height: 544 },
      // Center high platform
      { x: 384, y: 288, width: 192, height: 64 },
      // Left mid platform
      { x: 96,  y: 384, width: 160, height: 64 },
      // Right mid platform
      { x: 704, y: 384, width: 160, height: 64 },
      // Left high platform
      { x: 64,  y: 224, width: 128, height: 64 },
      // Right high platform
      { x: 800, y: 224, width: 128, height: 64 },
    ],
  },
  coliseum: {
    id: 'coliseum',
    label: 'Coliseu',
    width: 3840,
    height: 540,
    backgroundColor: 0x1a1a2d,
    description: 'Grande arena 4× com zonas simétricas para batalhas em equipes.',
    spawnPoints: [
      { x: 200, y: 460 },
      { x: 3640, y: 460 },
    ],
    platforms: [
      // Boundary walls
      { x: 0,    y: 0, width: 32,   height: 544 },
      { x: 3808, y: 0, width: 32,   height: 544 },
      // Full ground
      { x: 0, y: 508, width: 3840, height: 64 },

      // ── Left zone (0–960) ──
      { x: 64,  y: 224, width: 160, height: 64  }, // left high
      { x: 96,  y: 384, width: 192, height: 64  }, // left mid
      { x: 352, y: 288, width: 192, height: 64  }, // left-center
      { x: 640, y: 224, width: 192, height: 64  }, // left approach bridge
      { x: 736, y: 416, width: 128, height: 128 }, // left approach pillar (wallable)

      // ── Center-left zone (960–1920) ──
      { x: 960,  y: 288, width: 256, height: 64  }, // center-left mid
      { x: 1152, y: 160, width: 256, height: 64  }, // center-left high
      { x: 1344, y: 384, width: 128, height: 160 }, // center-left pillar (wallable)

      // ── Top center bridge ──
      { x: 1664, y: 128, width: 512, height: 64 },

      // ── Center-right zone (1920–2880) ──
      { x: 2368, y: 384, width: 128, height: 160 }, // center-right pillar (wallable)
      { x: 2432, y: 160, width: 256, height: 64  }, // center-right high
      { x: 2624, y: 288, width: 256, height: 64  }, // center-right mid

      // ── Right zone (2880–3840) ──
      { x: 2976, y: 416, width: 128, height: 128 }, // right approach pillar (wallable)
      { x: 3008, y: 224, width: 192, height: 64  }, // right approach bridge
      { x: 3296, y: 288, width: 192, height: 64  }, // right-center
      { x: 3552, y: 384, width: 192, height: 64  }, // right mid
      { x: 3616, y: 224, width: 160, height: 64  }, // right high
    ],
  },
};
