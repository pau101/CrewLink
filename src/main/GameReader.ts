import { DataType, findModule, getProcesses, ModuleObject, openProcess, closeProcess, ProcessObject, readBuffer, readMemory as readMemoryRaw } from "memoryjs";
import * as Struct from 'structron';
import patcher from '../patcher';
import { IOffsets } from "./hook";

export interface AmongUsState {
	gameState: GameState;
	oldGameState: GameState;
	lobbyCode: string;
	map: MapType;
	openDoors: number;
	isCommsSabotaged: boolean;
	viewingCameras: number;
	players: Player[];
}
export interface Player {
	ptr: number;
	id: number;
	name: string;
	colorId: number;
	hatId: number;
	petId: number;
	skinId: number;
	disconnected: boolean;
	isImpostor: boolean;
	isDead: boolean;
	taskPtr: number;
	objectPtr: number;
	isLocal: boolean;

	x: number;
	y: number;
	inVent: boolean;
}
export enum GameState {
	LOBBY, TASKS, DISCUSSION, MENU, UNKNOWN
}
export enum MapType {
	THE_SKELD, MIRA_HQ, POLUS, UNKNOWN
}

export default class GameReader {
	reply: Function;
	offsets: IOffsets;
	PlayerStruct: any;

	menuUpdateTimer = 20;
	lastPlayerPtr = 0;
	shouldReadLobby = false;
	exileCausesEnd = false;
	oldGameState = GameState.UNKNOWN;
	lastState: AmongUsState = {} as AmongUsState;

	amongUs: ProcessObject | null = null;
	gameAssembly: ModuleObject | null = null;

	gameCode: string = 'MENU';

	checkProcessOpen(): void {
		let processOpen = getProcesses().find(p => p.szExeFile === 'Among Us.exe');
		if (!this.amongUs && processOpen) { // If process just opened
			try {
				this.amongUs = openProcess('Among Us.exe');
				this.gameAssembly = findModule('GameAssembly.dll', this.amongUs.th32ProcessID);
				this.reply('gameOpen', true);
			} catch (e) {
				this.close();
			}
		} else if (this.amongUs && !processOpen) {
			this.close();
			this.reply('gameOpen', false);
		}
		return;
	}

	loop(): void {
		this.checkProcessOpen();
		if (this.amongUs !== null && this.gameAssembly !== null) {
			let state = GameState.UNKNOWN;
			let meetingHud = this.readMemory<number>('pointer', this.gameAssembly.modBaseAddr, this.offsets.meetingHud);
			let meetingHud_cachePtr = meetingHud === 0 ? 0 : this.readMemory<number>('uint32', meetingHud, this.offsets.meetingHudCachePtr);
			let meetingHudState = meetingHud_cachePtr === 0 ? 4 : this.readMemory('int', meetingHud, this.offsets.meetingHudState, 4);
			let gameState = this.readMemory<number>('int', this.gameAssembly.modBaseAddr, this.offsets.gameState);

			switch (gameState) {
				case 0:
					state = GameState.MENU;
					this.exileCausesEnd = false;
					break;
				case 1:
				case 3:
					state = GameState.LOBBY;
					this.exileCausesEnd = false;
					break;
				default:
					if (this.exileCausesEnd)
						state = GameState.LOBBY;
					else if (meetingHudState < 4)
						state = GameState.DISCUSSION;
					else
						state = GameState.TASKS;
					break;
			}

			const shipPtr = this.readMemory<number>('ptr', this.gameAssembly.modBaseAddr, this.offsets.ship);

			const map: MapType = this.readMemory<number>('int32', shipPtr, this.offsets.map, MapType.UNKNOWN);

			let openDoors = -1;
			const allDoorsPtr = this.readMemory<number>('uint32', shipPtr, this.offsets.allDoorsPtr);
			const allDoorsCount = Math.min(this.readMemory<number>('int32', allDoorsPtr, [ 0xC ]), 32);
			for (let i = 0; i < allDoorsCount; i++) {
				let open = this.readMemory<boolean>('byte', allDoorsPtr, [ 0x10 + i * 4, this.offsets.plainDoorIsOpen ]);
				if (!open) {
					openDoors &= ~(1 << i)
				}
			}
			
			let isCommsSabotaged: boolean = false;
			const systemsPtr = this.readMemory<number>('uint32', shipPtr, this.offsets.systemsPtr);
			if (systemsPtr !== 0) {
				this.readDictionary(systemsPtr, 32, (k, v) => {
					const key = readMemoryRaw<number>(this.amongUs!.handle, k, 'int32');
					if (key === this.offsets.commsSystemType || key === this.offsets.deconSystemType) {
						const sysPtr = readMemoryRaw<number>(this.amongUs!.handle, v, 'uint32');
						if (key === this.offsets.commsSystemType) {
							const systemType = this.readMemory<number>('int32', sysPtr, [ 0, 0x10 ]);
							if (systemType === this.offsets.hudOverrideSystemDefIndex) {
								isCommsSabotaged = !!this.readMemory<boolean>('byte', sysPtr, this.offsets.hudOverrideSystemIsActive, false);
							} else if (systemType === this.offsets.hqHudSystemDefIndex) {
								isCommsSabotaged = this.readMemory<number>('int32', sysPtr, this.offsets.hqHudSystemCompletedCount) < 2;
							}
						} else {
							const doorType = this.readMemory<number>('int32', sysPtr, [ this.offsets.upperManualDoor, 0, 0x10 ]);
							if (doorType === this.offsets.manualDoorDefIndex) {
								const upperOpen = this.readMemory<boolean>('byte', sysPtr, [ this.offsets.upperManualDoor, this.offsets.manualDoorIsOpen ], false);
								if (!upperOpen) {
									openDoors &= ~(1 << allDoorsCount);
								}
								const lowerOpen = this.readMemory<boolean>('byte', sysPtr, [ this.offsets.lowerManualDoor, this.offsets.manualDoorIsOpen ], false);
								if (!lowerOpen) {
									openDoors &= ~(1 << (1 + allDoorsCount));
								}
							}
						}
					}
				});
			}

			let viewingCameras = 0;
			const minigamePtr = this.readMemory<number>('ptr', this.gameAssembly.modBaseAddr, this.offsets.minigame);
			if (this.readMemory<number>('int32', minigamePtr, this.offsets.minigameClosingState) === 0) {
				const minigameType = this.readMemory<number>('int32', minigamePtr, [ 0, 0x10 ]);
				if (minigameType === this.offsets.surveillanceDefIndex) {
					viewingCameras = -1;
				} else if (minigameType == this.offsets.polusSurveillanceDefIndex) {
					viewingCameras = 1 << this.readMemory<number>('int32', minigamePtr, this.offsets.polusSurveillanceCurrentCamera)
				}
			}

			let allPlayersPtr = this.readMemory<number>('ptr', this.gameAssembly.modBaseAddr, this.offsets.allPlayersPtr) & 0xffffffff;
			let allPlayers = this.readMemory<number>('ptr', allPlayersPtr, this.offsets.allPlayers);
			let playerCount = this.readMemory<number>('int' as 'int', allPlayersPtr, this.offsets.playerCount);
			let playerAddrPtr = allPlayers + this.offsets.playerAddrPtr;
			let players = [];

			let exiledPlayerId = this.readMemory<number>('byte', this.gameAssembly.modBaseAddr, this.offsets.exiledPlayerId);
			let impostors = 0, crewmates = 0;

			for (let i = 0; i < Math.min(playerCount, 10); i++) {
				let { address, last } = this.offsetAddress(playerAddrPtr, this.offsets.player.offsets);
				let playerData = readBuffer(this.amongUs.handle, address + last, this.offsets.player.bufferLength);
				let player = this.parsePlayer(address + last, playerData);
				playerAddrPtr += 4;
				players.push(player);

				if (player.name === '' || player.id === exiledPlayerId || player.isDead || player.disconnected) continue;

				if (player.isImpostor)
					impostors++;
				else
					crewmates++;
			}

			if (this.oldGameState === GameState.DISCUSSION && state === GameState.TASKS) {
				if (impostors === 0 || impostors >= crewmates) {
					this.exileCausesEnd = true;
					state = GameState.LOBBY;
				}
			}
			if (this.oldGameState === GameState.MENU && state === GameState.LOBBY && this.menuUpdateTimer > 0 &&
				(this.lastPlayerPtr === allPlayers || players.length === 1 || !players.find(p => p.isLocal))) {
				state = GameState.MENU;
				this.menuUpdateTimer--;
			} else {
				this.menuUpdateTimer = 20;
			}
			this.lastPlayerPtr = allPlayers;

			if (state === GameState.LOBBY) {
				const code = this.readMemory<number>('int32', this.gameAssembly.modBaseAddr, this.offsets.gameCode);
				if (code) {
					this.gameCode = this.intToGameCode(code);
				}
			} else if (state !== GameState.TASKS && state !== GameState.DISCUSSION) {
				this.gameCode = 'MENU';
			}

			let newState = {
				lobbyCode: this.gameCode,
				players,
				gameState: state,
				oldGameState: this.oldGameState,
				map,
				openDoors,
				isCommsSabotaged,
				viewingCameras
			};
			let patch = patcher.diff(this.lastState, newState);
			if (patch) {
				try {
					this.reply('gameState', newState);
				} catch (e) {
					process.exit(0);
				}
			}
			this.lastState = newState;
			this.oldGameState = state;
		}
	}

	constructor(reply: Function, offsets: IOffsets) {
		this.reply = reply;
		this.offsets = offsets;


		this.PlayerStruct = new Struct();
		for (let member of offsets.player.struct) {
			if (member.type === 'SKIP') {
				this.PlayerStruct = this.PlayerStruct.addMember(Struct.TYPES.SKIP(member.skip!), member.name);
			} else {
				this.PlayerStruct = this.PlayerStruct.addMember(Struct.TYPES[member.type], member.name);
			}
		}

	}

	close() {
		if (this.amongUs) {
			try {
				closeProcess(this.amongUs.handle);
			} catch (e) {
				console.error(e);
			}
			this.amongUs = null;
		}
	}

	intToGameCode(code: number): string {
		const A = 'QWXRTYLPESDFGHUJKZOCVBINMA';
		const L = 26;
		if (code === 0) return 'QQQQQQ';
		let x = code & 0x3FF;
		let y = (code >> 10) & 0xFFFFF;
		return A[x % L] + A[x / L | 0] + A[y % L] + A[(y /= L) % L | 0] + A[(y /= L) % L | 0] + A[(y /= L) % L | 0];
	}

	readMemory<T>(dataType: DataType, address: number, offsets: number[], defaultParam?: T): T {
		if (address === 0) return defaultParam as T;
		let { address: addr, last } = this.offsetAddress(address, offsets);
		if (addr === 0) return defaultParam as T;
		return readMemoryRaw<T>(
			this.amongUs!.handle,
			addr + last,
			dataType
		);
	}
	offsetAddress(address: number, offsets: number[]): { address: number, last: number } {
		address = address & 0xffffffff;
		for (let i = 0; i < offsets.length - 1; i++) {
			address = readMemoryRaw<number>(this.amongUs!.handle, address + offsets[i], 'uint32');

			if (address == 0) break;
		}
		let last = offsets.length > 0 ? offsets[offsets.length - 1] : 0;
		return { address, last };
	}
	readString(address: number): string {
		if (address === 0) return '';
		let length = readMemoryRaw<number>(this.amongUs!.handle, address + 0x8, 'int');
		// console.log(length);
		// console.log("reading string", length, length << 1);
		let buffer = readBuffer(this.amongUs!.handle, address + 0xC, length << 1);
		return buffer.toString('utf8').replace(/\0/g, '');
	}
	readDictionary(address: number, maxLen: number, callback: (keyPtr: number, valPtr: number) => void) {
		const entries = readMemoryRaw<number>(this.amongUs!.handle, address + 0xC, 'uint32') & 0xffffffff;
		const len = Math.min(readMemoryRaw<number>(this.amongUs!.handle, entries + 0xC, 'int32'), maxLen);
		for (let i = 0; i < len; i++) {
			const offset = entries + 0x10 + (i * 4 + 2) * 4;
			callback(offset, offset + 4);
		}
	}

	parsePlayer(ptr: number, buffer: Buffer): Player {
		let { data } = this.PlayerStruct.report(buffer, 0, {});

		let isLocal = this.readMemory<number>('int', data.objectPtr, this.offsets.player.isLocal) !== 0;

		let positionOffsets = isLocal ? [
			this.offsets.player.localX,
			this.offsets.player.localY
		] : [
				this.offsets.player.remoteX,
				this.offsets.player.remoteY
			];

		let x = this.readMemory<number>('float', data.objectPtr, positionOffsets[0]);
		let y = this.readMemory<number>('float', data.objectPtr, positionOffsets[1]);
		return {
			ptr,
			id: data.id,
			name: this.readString(data.name),
			colorId: data.color,
			hatId: data.hat,
			petId: data.pet,
			skinId: data.skin,
			disconnected: data.disconnected > 0,
			isImpostor: data.impostor > 0,
			isDead: data.dead > 0,
			taskPtr: data.taskPtr,
			objectPtr: data.objectPtr,
			inVent: this.readMemory<number>('byte', data.objectPtr, this.offsets.player.inVent) > 0,
			isLocal,
			x, y
		};
	}
}

