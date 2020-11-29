import React, { useEffect, useRef } from "react";
import Color from 'color';
import { Player } from "../main/GameReader";
import Tooltip from "react-tooltip-lite";

export interface CanvasProps {
	hat: number;
	skin: number;
	color: string;
	shadow: string;
	isAlive: boolean;
}

export interface AvatarProps {
	talking: boolean;
	borderColor: string;
	isAlive: boolean;
	player: Player;
	size: number;
	deafened?: boolean;
}

const playerColors = [
	['#C51111', '#7A0838'],
	['#132ED1', '#09158E'],
	['#117F2D', '#0A4D2E'],
	['#ED54BA', '#AB2BAD'],
	['#EF7D0D', '#B33E15'],
	['#F5F557', '#C38823'],
	['#3F474E', '#1E1F26'],
	['#D6E0F0', '#8394BF'],
	['#6B2FBB', '#3B177C'],
	['#71491E', '#5E2615'],
	['#38FEDC', '#24A8BE'],
	['#50EF39', '#15A742']
];

export default function Avatar({ talking, deafened, borderColor, isAlive, player, size }: AvatarProps) {
	let color = playerColors[player.colorId];
	if (!color) color = playerColors[0];
	return (
		<Tooltip useHover={!player.isLocal} content={player.name} padding={5}>
			<div className="avatar" style={{
				borderColor: talking ? borderColor : 'transparent',
				borderWidth: Math.max(2, size / 40),
				width: size,
				height: size
			}}>
				<Canvas hat={player.hatId - 1} skin={player.skinId - 1} isAlive={isAlive} color={color[0]} shadow={color[1]} />
				{
					deafened &&
					<svg viewBox="0 0 24 24" fill="white" width="28px" height="28px"><path d="M0 0h24v24H0z" fill="none" /><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
				}
			</div>

		</Tooltip>
	);
}

function Canvas({ hat, skin, color, shadow, isAlive }: CanvasProps) {
	const canvas = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		async function drawAsync() {
			if (!canvas.current) return;
			const ctx = canvas.current.getContext('2d')!;

			const size = canvas.current.width;
			const asize = 0.8 * size;

			ctx.save();
			ctx.clearRect(0, 0, size, size);
			ctx.translate(0.5 * size, 0.5 * size);
			ctx.scale(asize, asize);
			ctx.translate(-0.5, -0.5);

			{
				ctx.save();
				// clip
				ctx.beginPath();
				ctx.arc(0.5, 0.5, 0.5, 0, 2 * Math.PI, false);
				ctx.clip();

				// body shadow
				ctx.fillStyle = Color(shadow).string()
				ctx.fillRect(0, 0, 1, 1);

				// body color
				ctx.beginPath();
				ctx.arc(0.55, 0.4, 0.45, 0, 2 * Math.PI, false);
				ctx.fillStyle = Color(color).string()
				ctx.fill();
				ctx.beginPath();
				ctx.restore();
			}

			// body outline
      // ctx.beginPath();
			ctx.arc(0.5, 0.5, 0.5, 0, 2 * Math.PI, false);
			ctx.strokeStyle = 'black';
			ctx.lineCap = 'round';
			ctx.lineWidth = 0.065;
			ctx.stroke();

			// helmet outline
			const hx0 = 0.56;
			const hx1 = 0.91;
			const hy = 0.44;
			ctx.beginPath();
			ctx.moveTo(hx0, hy);
			ctx.lineTo(hx1, hy);
			ctx.strokeStyle = 'black';
			ctx.lineCap = 'round';
			ctx.lineWidth = 0.39;
			ctx.stroke();

			// helmet shadow
			ctx.beginPath();
			ctx.moveTo(hx0, hy);
			ctx.lineTo(hx1, hy);
			ctx.strokeStyle = '#4c6469';
			ctx.lineCap = 'round';
			ctx.lineWidth = 0.275;
			ctx.stroke();

			// helmet color
			ctx.beginPath();
			ctx.moveTo((hx0 + 0.01), (hy - 0.02));
			ctx.lineTo((hx1 + 0.03), (hy - 0.02));
			ctx.strokeStyle = '#9acad5';
			ctx.lineCap = 'round';
			ctx.lineWidth = 0.2;
			ctx.stroke();

			// helmet highlight
			ctx.beginPath();
			ctx.moveTo((hx0 + 0.14), (hy - 0.045));
			ctx.lineTo(hx1, (hy - 0.045));
			ctx.strokeStyle = 'white';
			ctx.lineCap = 'round';
			ctx.lineWidth = 0.08;
			ctx.stroke();

			ctx.restore();
			
			if (!isAlive) {
				const imgData = ctx.getImageData(0, 0, size, size);
				for (let i = 0; i < imgData.data.length; i += 4) {
					imgData.data[i + 3] /= 2;
				}
				ctx.putImageData(imgData, 0, 0);
			}
		}
		drawAsync();
	}, [color, shadow, hat, skin, isAlive]);

	return <canvas className='canvas' ref={canvas} width='100' height='100' />
}