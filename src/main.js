import { Core } from "./emu/core.js"
import { Disassembler } from "./emu/cpu_dis.js"


let g_wasm = null
let g_desiredBackend = 0
let g_isRunning = false
let g_screenBuffer = null
let g_requestAnimationFrame = null
let g_lastFrameTimestamp = 0

let audioCtx = null
let keyA = false
let keyB = false
let keySelect = false
let keyStart = false
let keyUp = false
let keyDown = false
let keyLeft = false
let keyRight = false
let keyFastForward = false
let keySlowMotion = false


export function main()
{
	window.onkeydown = (ev) => handleKey(ev, true)
	window.onkeyup = (ev) => handleKey(ev, false)
	
	fetch("mahnes_rs.gc.wasm")
		.then(r => r.arrayBuffer())
		.then(r => WebAssembly.instantiate(r))
		.then(wasm =>
		{
			g_wasm = wasm
			document.getElementById("radioRunWasm").disabled = false
			document.getElementById("labelRadioRunWasm").innerHTML = "Rust + WebAssembly (no sound)"
		})
		
	reset()
	
	document.getElementById("radioRunJS")  .onclick = () => handleRadioBackendOnChange(0)
	document.getElementById("radioRunWasm").onclick = () => handleRadioBackendOnChange(1)
	
	let inputFile = document.getElementById("inputFile")
	inputFile.onchange = () =>
	{
		if (inputFile.files.length != 1)
			return
		
		reset()
		
		let reader = new FileReader()
		reader.onload = () => (g_desiredBackend == 0 ? loadJS(reader.result) : loadWasm(reader.result))
		reader.readAsArrayBuffer(inputFile.files[0])
	}
}


function handleRadioBackendOnChange(i)
{
	g_desiredBackend = i
	reset()
}


function handleKey(ev, down)
{
	switch (ev.key)
	{
		case " ":
		case "Z":
		case "z":
		case "Alt":
			keyA = down
			break
			
		case "X":
		case "x":
		case "Control":
			keyB = down
			break
			
		case "5":
		case "Shift":
		case "G":
		case "g":
			keySelect = down
			break
			
		case "1":
		case "H":
		case "h":
			keyStart = down
			break
			
		case "ArrowUp":
		case "W":
		case "w":
			keyUp = down
			break
			
		case "ArrowDown":
		case "S":
		case "s":
			keyDown = down
			break
			
		case "ArrowLeft":
		case "A":
		case "a":
			keyLeft = down
			break
			
		case "ArrowRight":
		case "D":
		case "d":
			keyRight = down
			break
			
		case "V":
		case "v":
			keyFastForward = down
			break
			
		case "B":
		case "b":
			keySlowMotion = down
			break
			
		default:
			return
	}
	
	ev.preventDefault()
}


function reset()
{
	if (audioCtx != null)
		audioCtx.close()
	
	if (g_requestAnimationFrame != null)
		window.cancelAnimationFrame(g_requestAnimationFrame)
	
	audioCtx = null
	g_requestAnimationFrame = null
	g_lastFrameTimestamp = 0
	
	let canvas = document.getElementById("canvasScreen")
	let ctx = canvas.getContext("2d")
	ctx.fillStyle = "black"
	ctx.fillRect(0, 0, 256, 240)
}


function loadJS(buffer)
{
	let emu = new Core()
	
	try { emu.loadINES(new Uint8Array(buffer)) }
	catch (e) { alert(e); return }
	
	emu.reset()
	
	audioCtx = new AudioContext()
	
	let canvas = document.getElementById("canvasScreen")
	let ctx = canvas.getContext("2d")
	g_screenBuffer = ctx.createImageData(256, 240)
	
	emu.connect(
		(scanline, dot, color, mask) => outputJS(emu, ctx, scanline, dot, color, mask),
		(i) => [keyA, keyB, keySelect, keyStart, keyUp, keyDown, keyLeft, keyRight],
		audioCtx)
	
	console.log(emu)
	
	g_isRunning = true
	g_lastFrameTimestamp = 0
	g_requestAnimationFrame = window.requestAnimationFrame(timestamp => runFrameJS(emu, timestamp))
	
	emu.cpu.hookExecuteInstruction = (addr, byte1, byte2, byte3) =>
	{
		/*console.log(addr.toString(16).padStart(4, "0") + ": " +
			"clock(" + emu.clock + ") " +
			"opcode(" + emu.cpu.opcode.toString(16) + ") " +
			"s(" + emu.cpu.regS.toString(16) + ") " +
			"a(" + emu.cpu.regA.toString(16) + ") " +
			"x(" + emu.cpu.regX.toString(16) + ") " +
			"y(" + emu.cpu.regY.toString(16) + ") " +
			"\t" +
			Disassembler.disassembleInstruction(addr, byte1, byte2, byte3));*/
	}
	
	document.getElementById("buttonDebug").onclick = () =>
	{
		let s = "mem:\n"
		for (let j = 0; j < 16; j++)
		{
			s += (0x600 + j * 16).toString(16).padStart(2, "0") + ": "
			
			for (let i = 0; i < 16; i++)
				s += emu.ram[0x600 + j * 16 + i].toString(16).padStart(2, "0") + " "
			
			s += "\n"
		}
		console.log(s)
		
		s = "first nametable:\n"
		for (let j = 0; j < 32; j++)
		{
			s += (j * 32).toString(16).padStart(2, "0") + ": "
			
			for (let i = 0; i < 32; i++)
				s += emu.vram[j * 32 + i].toString(16).padStart(2, "0") + " "
			
			s += "\n"
		}
		console.log(s)
		
		s = "palram:\n"
		for (let j = 0; j < 2; j++)
		{
			for (let i = 0; i < 16; i++)
				s += emu.palram[j * 16 + i].toString(16).padStart(2, "0") + " "
			
			s += "\n"
		}
		console.log(s)
	}
}


function loadWasm(buffer)
{
	buffer = new Uint8Array(buffer)
	
	try
	{
		let wasm_buffer = g_wasm.instance.exports.wasm_buffer_new(buffer.length)
		for (let i = 0; i < buffer.length; i++)
			g_wasm.instance.exports.wasm_buffer_set(wasm_buffer, i, buffer[i])
		
		g_wasm.instance.exports.wasm_core_new(wasm_buffer)
		g_wasm.instance.exports.wasm_buffer_drop(wasm_buffer)
	}
	catch (e)
	{
		window.alert("WASM error while loading!\n\nProbably an unsupported mapper.")
		throw e
	}
	
	let canvas = document.getElementById("canvasScreen")
	let ctx = canvas.getContext("2d")
	g_screenBuffer = ctx.createImageData(256, 240)
	
	g_isRunning = true
	g_lastFrameTimestamp = 0
	g_requestAnimationFrame = window.requestAnimationFrame((timestamp) => runFrameWasm(timestamp))
}


function runFrameJS(emu, timestamp)
{
	let frameTime =
		keyFastForward ? 1000 / 240 :
		keySlowMotion ? 1000 / 15 :
		1000 / 60
	
	if (g_lastFrameTimestamp < timestamp - frameTime * 5)
		g_lastFrameTimestamp = timestamp - frameTime * 5
	
	while (g_lastFrameTimestamp <= timestamp - frameTime)
	{
		g_lastFrameTimestamp += frameTime

		for (let i = 0; i < 29780; i++)
			emu.run()
	}
	
	if (g_isRunning)
		g_requestAnimationFrame = window.requestAnimationFrame(timestamp => runFrameJS(emu, timestamp))
}


function runFrameWasm(timestamp)
{
	const controller1 =
		(keyRight  ? 0x80 : 0) |
		(keyLeft   ? 0x40 : 0) |
		(keyDown   ? 0x20 : 0) |
		(keyUp     ? 0x10 : 0) |
		(keyStart  ? 0x08 : 0) |
		(keySelect ? 0x04 : 0) |
		(keyB      ? 0x02 : 0) |
		(keyA      ? 0x01 : 0)
	
	try
	{
		let frameTime =
			keyFastForward ? 1000 / 240 :
			keySlowMotion ? 1000 / 15 :
			1000 / 60

		if (g_lastFrameTimestamp < timestamp - frameTime * 5)
			g_lastFrameTimestamp = timestamp - frameTime * 5
		
		while (g_lastFrameTimestamp <= timestamp - frameTime)
		{
			g_lastFrameTimestamp += frameTime

			g_wasm.instance.exports.wasm_core_set_controller1(controller1)
			g_wasm.instance.exports.wasm_core_run_frame()
			outputWasm()
		}
	}
	catch (e)
	{
		window.alert("WASM error while running!\n\nProbably a bad opcode.")
		throw e
	}
	
	if (g_isRunning)
		g_requestAnimationFrame = window.requestAnimationFrame((timestamp) => runFrameWasm(timestamp))
}


function outputJS(emu, ctx, scanline, dot, color, mask)
{
	if (scanline == 0 && dot == 0)
		ctx.putImageData(g_screenBuffer, 0, 0)
	
	const dataAddr = ((scanline * 256) + dot) * 4
	const palAddr = color * 4
	g_screenBuffer.data[dataAddr + 0] = palette[palAddr + 0]
	g_screenBuffer.data[dataAddr + 1] = palette[palAddr + 1]
	g_screenBuffer.data[dataAddr + 2] = palette[palAddr + 2]
	g_screenBuffer.data[dataAddr + 3] = palette[palAddr + 3]
}


function outputWasm()
{
	const ptr = g_wasm.instance.exports.wasm_core_get_screen_buffer()
	const buffer = new Uint8ClampedArray(g_wasm.instance.exports.memory.buffer, ptr, 256 * 240 * 4)
	const imageData = new ImageData(buffer, 256, 240)
	
	let canvas = document.getElementById("canvasScreen")
	let ctx = canvas.getContext("2d")
	ctx.putImageData(imageData, 0, 0)
}


const palette =
[
	0x75, 0x75, 0x75, 0xff,
	0x27, 0x1b, 0x8f, 0xff,
	0x00, 0x00, 0xab, 0xff,
	0x47, 0x00, 0x9f, 0xff,
	0x8f, 0x00, 0x77, 0xff,
	0xab, 0x00, 0x13, 0xff,
	0xa7, 0x00, 0x00, 0xff,
	0x7f, 0x0b, 0x00, 0xff,
	0x43, 0x2f, 0x00, 0xff,
	0x00, 0x47, 0x00, 0xff,
	0x00, 0x51, 0x00, 0xff,
	0x00, 0x3f, 0x17, 0xff,
	0x1b, 0x3f, 0x5f, 0xff,
	0x00, 0x00, 0x00, 0xff,
	0x00, 0x00, 0x00, 0xff,
	0x00, 0x00, 0x00, 0xff,
	
	0xbc, 0xbc, 0xbc, 0xff,
	0x00, 0x73, 0xef, 0xff,
	0x23, 0x3b, 0xef, 0xff,
	0x83, 0x00, 0xf3, 0xff,
	0xbf, 0x00, 0xbf, 0xff,
	0xe7, 0x00, 0x5b, 0xff,
	0xdb, 0x2b, 0x00, 0xff,
	0xcb, 0x4f, 0x0f, 0xff,
	0x8b, 0x73, 0x00, 0xff,
	0x00, 0x97, 0x00, 0xff,
	0x00, 0xab, 0x00, 0xff,
	0x00, 0x93, 0x3b, 0xff,
	0x00, 0x83, 0x8b, 0xff,
	0x00, 0x00, 0x00, 0xff,
	0x00, 0x00, 0x00, 0xff,
	0x00, 0x00, 0x00, 0xff,
	
	0xff, 0xff, 0xff, 0xff,
	0x3f, 0xbf, 0xff, 0xff,
	0x5f, 0x97, 0xff, 0xff,
	0xa7, 0x8b, 0xfd, 0xff,
	0xf7, 0x7b, 0xff, 0xff,
	0xff, 0x77, 0xb7, 0xff,
	0xff, 0x77, 0x63, 0xff,
	0xff, 0x9b, 0x3b, 0xff,
	0xf3, 0xbf, 0x3f, 0xff,
	0x83, 0xd3, 0x13, 0xff,
	0x4f, 0xdf, 0x4b, 0xff,
	0x58, 0xf8, 0x98, 0xff,
	0x00, 0xeb, 0xdb, 0xff,
	0x00, 0x00, 0x00, 0xff,
	0x00, 0x00, 0x00, 0xff,
	0x00, 0x00, 0x00, 0xff,
	
	0xff, 0xff, 0xff, 0xff,
	0xab, 0xe7, 0xff, 0xff,
	0xc7, 0xd7, 0xff, 0xff,
	0xd7, 0xcb, 0xff, 0xff,
	0xff, 0xc7, 0xff, 0xff,
	0xff, 0xc7, 0xdb, 0xff,
	0xff, 0xbf, 0xb3, 0xff,
	0xff, 0xdb, 0xab, 0xff,
	0xff, 0xe7, 0xa3, 0xff,
	0xe3, 0xff, 0xa3, 0xff,
	0xab, 0xf3, 0xbf, 0xff,
	0xb3, 0xff, 0xcf, 0xff,
	0x9f, 0xff, 0xf3, 0xff,
	0x00, 0x00, 0x00, 0xff,
	0x00, 0x00, 0x00, 0xff,
	0x00, 0x00, 0x00, 0xff,
]
