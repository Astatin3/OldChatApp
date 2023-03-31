var server = require('ws').Server
const fs = require('fs');
const { stringify } = require('querystring');
const CryptoJS = require('crypto-js');
const { type } = require('os');
var socket = new server({ port : 12301 })

let creds = JSON.parse(fs.readFileSync('./server/creds.json'));
let logjson = fs.readFileSync("./server/log.json","utf-8")

function ValidateAcc(ws, message, date){
	let creds = JSON.parse(fs.readFileSync('./server/creds.json'));
	if(creds[message.id].auth == message.data){
		ws.id = message.id
		ws.name = creds[ws.id].name
		ws.Sessionid = String(Math.random())
		ws.SessionExpire = date.getTime() + 360000 // 1 hour

		console.log(ws.name + "#" + ws.id + " Connected")

		return true
	}else{
		return false
	}
}

function ValidateSession(ws, Session, date){
	if(ws.Sessionid == Session && ws.SessionExpire > date.getTime()){
		return true
	}else{
		ws.send(JSON.stringify({
			type: "Error",
			data: "Invalid Session"
		}))
		return false
	}
}

function LogMSG(json) {
	var prevlog = JSON.parse(logjson)
	console.log(json.name + ": " + json.data)
	prevlog.push(json)
	var str = JSON.stringify(prevlog)
	fs.writeFileSync("./server/log.json", str, "utf-8")
	logjson = fs.readFileSync("./server/log.json","utf-8")
}

function Recap(ws, point) {

	let creds = JSON.parse(fs.readFileSync('./server/creds.json'));
	const prevmsg = JSON.parse(logjson)
	var i = prevmsg.length-1-point

	var NoLoadMore = false

	while(i > prevmsg.length-50-point) {

		if(!prevmsg[i]){
			NoLoadMore = true
			ws.send(JSON.stringify({
				id: ws.id,
				data: CryptoJS.AES.encrypt(JSON.stringify({
					type: "StartFile",
					salt: CryptoJS.enc.Base64.stringify(CryptoJS.lib.WordArray.random(17))
				}), ws.auth).toString()
			}))
			break
		}

		try {
			ws.send(JSON.stringify({
				id: prevmsg[i].id,
				data: CryptoJS.AES.encrypt(JSON.stringify({
					type: "RecapMSG",
					name: creds[prevmsg[i].id].name,
					color: creds[prevmsg[i].id].color,
					time: prevmsg[i].time,
					message: prevmsg[i].data,
					salt: CryptoJS.enc.Base64.stringify(CryptoJS.lib.WordArray.random(17))
				}), ws.auth).toString()
			}))	
		} catch (e) {
			return false;
		}

		i = i - 1
	}
	if(!NoLoadMore){
		ws.send(JSON.stringify({
			id: ws.id,
			data: CryptoJS.AES.encrypt(JSON.stringify({
				type: "RecapFinished",
				salt: CryptoJS.enc.Base64.stringify(CryptoJS.lib.WordArray.random(17))
			}), ws.auth).toString()
		}))
	}
}

function loadInfo(ws, id, date) {
	try {
		ws.id = creds[id].id
		ws.name = creds[id].name
		ws.color = creds[id].color
		ws.auth = creds[id].auth
		ws.SessionExpire = date.getTime() + 360000 // 1 hour
	} catch (e) {
		return false;
	}
	console.log(ws.name + "#" + ws.id + " Connected")
	return true
}


socket.on('connection', function (ws) {
	
	// ws.send(JSON.stringify({
	// 	type: "MetaMSG",
	// 	data: "Connected to server"
	// }))

	ws.on('message', function (message) {
		let date = new Date();
		let Time = date.getTime()

		message = JSON.parse(message)

		if(!ws.id){
			if(!loadInfo(ws, message.id, date)){
				ws.send(JSON.stringify({
					type: "Error",
					data: "Invalid Session",
					salt: CryptoJS.enc.Base64.stringify(CryptoJS.lib.WordArray.random(17))
				}))
				return false
			}
		}

		var data
		try {
			data = JSON.parse(CryptoJS.AES.decrypt(message.data, ws.auth).toString(CryptoJS.enc.Utf8))
		} catch (e) {
			return false;
		}

		if(String(data.message).length > 200){

			ws.send(JSON.stringify({
				id: "Server",
				data: CryptoJS.AES.encrypt(JSON.stringify({
					type: "Error",
					message: "200 Charactor limit!",
					salt: CryptoJS.enc.Base64.stringify(CryptoJS.lib.WordArray.random(17))
				  }), ws.auth).toString()
			}))
			return false
		}
		
		switch(data.type) {
		
			case "key":
				if(!ValidateAcc(ws, message, date)){
					ws.send(JSON.stringify({
						type: "KeyAck",
						data: "Invalid Credentials"
					}))
					return
				}

				ws.send(JSON.stringify({
					type: "KeyAck",
					id: ws.id,
					name: ws.name,
					data: ws.Sessionid
				}))
				Recap(ws)
			break

			case "message":

				LogMSG({
					id: ws.id,
					type: "message",
					time: Time,
					data: data.message
				})

				socket.clients.forEach(function (client) {

					client.send(JSON.stringify({
						id: ws.id,
						data: CryptoJS.AES.encrypt(JSON.stringify({
							type: "message",
							name: ws.name,
							color: ws.color,
							time: Time,
							message: data.message,
							salt: CryptoJS.enc.Base64.stringify(CryptoJS.lib.WordArray.random(17))
						  }), client.auth).toString()
					}))
				})
			break

			case "image":

				LogMSG({
					id: ws.id,
					type: "image",
					time: Time,
					URL: data.URL
				})

				socket.clients.forEach(function (client) {

					client.send(JSON.stringify({
						id: ws.id,
						data: CryptoJS.AES.encrypt(JSON.stringify({
							type: "image",
							name: ws.name,
							color: ws.color,
							time: Time,
							URL: data.URL,
							salt: CryptoJS.enc.Base64.stringify(CryptoJS.lib.WordArray.random(17))
						  }), client.auth).toString()
					}))
				})
			break

			case "URL":

				LogMSG({
					id: ws.id,
					type: "URL",
					time: Time,
					URL: data.URL
				})

				socket.clients.forEach(function (client) {

					client.send(JSON.stringify({
						id: ws.id,
						data: CryptoJS.AES.encrypt(JSON.stringify({
							type: "URL",
							name: ws.name,
							color: ws.color,
							time: Time,
							URL: data.URL,
							salt: CryptoJS.enc.Base64.stringify(CryptoJS.lib.WordArray.random(17))
						  }), client.auth).toString()
					}))
				})
			break

			case "GetSettings":
				ws.send(JSON.stringify({
					id: ws.id,
					data: CryptoJS.AES.encrypt(JSON.stringify({
						type: "SettingsInfo",
						name: ws.name,
						color: ws.color,
						salt: CryptoJS.enc.Base64.stringify(CryptoJS.lib.WordArray.random(17))
					}), ws.auth).toString()
				}))
			break

			case "Recap":
			
				Recap(ws, data.point)

			break
		}
	})
})

console.log("Server Ready")
