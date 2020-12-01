import { AmongUsState } from '../main/GameReader';

export default class Ship {
  private points: Float32Array;
  private walls: Uint16Array;
  private windows: Uint16Array;
  private doors: Array<Uint16Array>;
  cameras: Array<number[]>;

  private constructor(points: Float32Array, walls: Uint16Array, windows: Uint16Array, doors: Array<Uint16Array>, cameras: Array<number[]>) {
    this.points = points;
    this.walls = walls;
    this.windows = windows;
    this.doors = doors;
    this.cameras = cameras;
  }

  // https://www.geeksforgeeks.org/check-if-two-given-line-segments-intersect/
  blocked(state: AmongUsState, mx: number, my: number, nx: number, ny: number): number {
    const wall = this.intersects(this.walls, mx, my, nx, ny);
    if (wall !== 0) {
      return wall;
    }
    const window = this.intersects(this.windows, mx, my, nx, ny);
    if (window !== 0) {
      return 0.5;
    }
    for (let i = 0; i < this.doors.length; i++) {
      if ((state.openDoors & (1 << i)) === 0) {
        const door = this.intersects(this.doors[i], mx, my, nx, ny);
        if (door !== 0) {
          return door;
        }
      }
    }
    return 0;
  }

  private intersects(lines: Uint16Array, mx: number, my: number, nx: number, ny: number): number {
    for (const v of lines) {
      const x0 = this.points[v + 0];
      const y0 = this.points[v + 1];
      const x1 = this.points[v + 2];
      const y1 = this.points[v + 3];
      const o1 = this.orientation(mx, my, nx, ny, x0, y0);
      const o2 = this.orientation(mx, my, nx, ny, x1, y1);
      const o3 = this.orientation(x0, y0, x1, y1, mx, my);
      const o4 = this.orientation(x0, y0, x1, y1, nx, ny);
      if (o1 != o2 && o3 != o4) return 1;
      // if (o1 == 0 && this.segment(mx, my, x0, y0, nx, ny)) return 1; 
      // if (o2 == 0 && this.segment(mx, my, x1, y1, nx, ny)) return 1; 
      // if (o3 == 0 && this.segment(x0, y0, mx, my, x1, y1)) return 1; 
      // if (o4 == 0 && this.segment(x0, y0, nx, ny, x1, y1)) return 1; 
    }
    return 0;
  }

  private orientation(px: number, py: number, qx: number, qy: number, rx: number, ry: number): number {
    const v = (qy - py) * (rx - qx) - (qx - px) * (ry - qy);
    return Math.abs(v) < 1e-2 ? 0 : Math.sign(v);
  }

  // private segment(px: number, py: number, qx: number, qy: number, rx: number, ry: number): boolean { 
  //   return qx <= Math.max(px, rx) && qx >= Math.min(px, rx) && qy <= Math.max(py, ry) && qy >= Math.min(py, ry);
  // }

  static parse(json: any): Ship {
    const points: number[] = [];
    const lines: number[] = [];
    const doors: Uint16Array[] = [];
    let index = 0;
    for (const path of json.walls) {
      for (const point of path) {
        const x: number = point[0];
        const y: number = point[1];
        points.push(x);
        points.push(y);
        lines.push(index);
        index += 2;
      }
      lines.pop();
    }
    const windows: number[] = [];
    for (const path of json.windows) {
      for (const point of path) {
        const x: number = point[0];
        const y: number = point[1];
        points.push(x);
        points.push(y);
        windows.push(index);
        index += 2;
      }
      windows.pop();
    }
    for (const path of json.doors) {
      const doorLines: number[] = [];
      for (const point of path) {
        const x: number = point[0];
        const y: number = point[1];
        points.push(x);
        points.push(y);
        doorLines.push(index);
        index += 2;
      }
      doorLines.pop();
      doors.push(Uint16Array.from(doorLines));
    }
    const cameras = [];
    for (const cam of json.cameras) {
      cameras.push(cam.slice(0, 2));
    }
    return new Ship(Float32Array.from(points), Uint16Array.from(lines),  Uint16Array.from(windows), doors, cameras);
  }
}