const mineflayer = require('mineflayer')
const pvp = require('mineflayer-pvp').plugin
const { pathfinder, Movements, goals} = require('mineflayer-pathfinder')
const GoalFollow = goals.GoalFollow
const armorManager = require('mineflayer-armor-manager')
const vec3 = require('vec3')
const autoeat = require('mineflayer-auto-eat')
const minecraftHawkEye = require('minecrafthawkeye')
const config = require('./config.json')

const bot = mineflayer.createBot({
    host: config.ip,
    port: config.port,
    username: config.bot_name,
    logErrors: false
})

bot.loadPlugin(pvp)
bot.loadPlugin(armorManager)
bot.loadPlugin(pathfinder)
bot.loadPlugin(autoeat)
bot.loadPlugin(minecraftHawkEye)

bot.once('spawn', () => {
  bot.autoEat.options = {
    priority: 'foodPoints',
    startAt: 19.5,
    bannedFood: []
  }
})
// The bot eats food automatically and emits these events when it starts eating and stops eating.

bot.on('autoeat_started', () => {
  console.log('Auto Eat started!')
})

bot.on('autoeat_stopped', () => {
  console.log('Auto Eat stopped!')
})

bot.on('health', () => {
  if (bot.food === 20) bot.autoEat.disable()
  // Disable the plugin if the bot is at 20 food points
  else bot.autoEat.enable() // Else enable the plugin again
})

let guardPos = null

function guardArea (pos) {
  guardPos = pos.clone()

  if (!bot.pvp.target) {
    moveToGuardPos()
  }
}

function stopGuarding () {
  guardPos = null
  bot.pvp.stop()
  bot.pathfinder.setGoal(null)
}

function moveToGuardPos () {
  const mcData = require('minecraft-data')(bot.version)
  bot.pathfinder.setMovements(new Movements(bot, mcData))
  bot.pathfinder.setGoal(new goals.GoalBlock(guardPos.x, guardPos.y, guardPos.z))
}

function followPlayer () {
  const playerCI = bot.players['aaa3032']

  if (!playerCI) {
  bot.chat("I can`t see you")
  return
  }
  const mcData = require('minecraft-data')(bot.version)
  const movements = new Movements(bot, mcData)

  bot.pathfinder.setMovements(movements)

  const goal = new GoalFollow(playerCI.entity, 1)
  bot.pathfinder.setGoal(goal, true)
}

function dig () {
  let target
  if (bot.targetDigBlock) {
    bot.chat(`already digging ${bot.targetDigBlock.name}`)
  } else {
    target = bot.blockAt(bot.entity.position.offset(0, -1, 0))
    if (target && bot.canDigBlock(target)) {
      bot.chat(`starting to dig ${target.name}`)
      bot.dig(target, onDiggingCompleted)
    } else {
      bot.chat('cannot dig')
    }
  }

  function onDiggingCompleted (err) {
    if (err) {
      console.log(err.stack)
      return
    }
    bot.chat(`finished digging ${target.name}`)
  }
}

function build () {
  const referenceBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0))
  const jumpY = Math.floor(bot.entity.position.y) + 1.0
  bot.setControlState('jump', true)
  bot.on('move', placeIfHighEnough)

  let tryCount = 0

  function placeIfHighEnough () {
    if (bot.entity.position.y > jumpY) {
      bot.placeBlock(referenceBlock, vec3(0, 1, 0), (err) => {
        if (err) {
          tryCount++
          if (tryCount > 10) {
            bot.chat(err.message)
            bot.setControlState('jump', false)
            bot.removeListener('move', placeIfHighEnough)
            return
          }
          return
        }
        bot.setControlState('jump', false)
        bot.removeListener('move', placeIfHighEnough)
        bot.chat('Placing a block was successful')
      })
    }
  }
}

function equipDirt () {
  const mcData = require('minecraft-data')(bot.version)
  let itemsByName
  if (bot.supportFeature('itemsAreNotBlocks')) {
    itemsByName = 'itemsByName'
  } else if (bot.supportFeature('itemsAreAlsoBlocks')) {
    itemsByName = 'blocksByName'
  }
  bot.equip(mcData[itemsByName].dirt.id, 'hand', (err) => {
    if (err) {
      bot.chat(`unable to equip dirt: ${err.message}`)
    } else {
      bot.chat('equipped dirt')
    }
  })
}

bot.on('stoppedAttacking', () => {
  if (guardPos) {
    moveToGuardPos()
  }
})

bot.on('physicTick', () => {
  if (bot.pvp.target) return
  if (bot.pathfinder.isMoving()) return

  const entity = bot.nearestEntity()
  if (entity) bot.lookAt(entity.position.offset(0, entity.height, 0))
})

bot.on('physicTick', () => {
  if (!guardPos) return

  const filter = e => e.type === 'mob' && e.position.distanceTo(bot.entity.position) < 16 &&
                      e.mobType == 'Zombie'
  const filter2 = e => e.type === 'mob' && e.position.distanceTo(bot.entity.position) < 16 &&
                      e.mobType == 'Husk'

  const entity = bot.nearestEntity(filter)
  const entity2 = bot.nearestEntity(filter2)
  if (entity) {
    bot.pvp.attack(entity)
  }
  if (entity2) {
    bot.pvp.attack(entity2)
  }
})

bot.on('chat', (username, message) => {
  if (message === 'guard') {
    const player = bot.players[username]

    if (!player) {
      bot.chat("I can't see you.")
      return
    }

    bot.chat('I will guard that location.')
    guardArea(player.entity.position)
  }

  if (message === 'fight me') {
    const player = bot.players[username]

    if (!player) {
      bot.chat("I can't see you.")
      return
    }

    bot.chat('Prepare to fight!')
    bot.pvp.attack(player.entity)
  }

  if (message === 'follow me') {
      followPlayer()
  }

  if (message === 'stop') {
    bot.chat('I will no longer guard this area.')
    stopGuarding()
  }
})
bot.on('chat', async (username, message) => {
  if (username === bot.username) return
  switch (message) {
    case 'loaded':
      await bot.waitForChunksToLoad()
      bot.chat('Ready!')
      break
    case 'dig':
      dig()
      break
    case 'build':
      build()
      break
    case 'equip dirt':
      equipDirt()
      break
  }
})
bot.on('chat', (username, message) => {
  if (username === bot.username) return
  switch (message) {
    case 'sleep':
      goToSleep()
      break
    case 'wakeup':
      wakeUp()
      break
  }
})

bot.on('sleep', () => {
  bot.chat('Good night!')
})
bot.on('wake', () => {
  bot.chat('Good morning!')
})

async function goToSleep () {
  const bed = bot.findBlock({
    matching: block => bot.isABed(block)
  })
  if (bed) {
    try {
      await bot.sleep(bed)
      bot.chat("I'm sleeping")
    } catch (err) {
      bot.chat(`I can't sleep: ${err.message}`)
    }
  } else {
    bot.chat('No nearby bed')
  }
}

async function wakeUp () {
  try {
    await bot.wake()
  } catch (err) {
    bot.chat(`I can't wake up: ${err.message}`)
  }
}

bot.on('chat', async (username, message) => {
  if (username === bot.username) return
  const command = message.split(' ')
  switch (true) {
    case message === 'loaded':
      await bot.waitForChunksToLoad()
      bot.chat('Ready!')
      break
    case /^list$/.test(message):
      sayItems()
      break
    case /^toss \d+ \w+$/.test(message):
      // toss amount name
      // ex: toss 64 diamond
      tossItem(command[2], command[1])
      break
    case /^toss \w+$/.test(message):
      // toss name
      // ex: toss diamond
      tossItem(command[1])
      break
    case /^equip \w+ \w+$/.test(message):
      // equip destination name
      // ex: equip hand diamond
      equipItem(command[2], command[1])
      break
    case /^unequip \w+$/.test(message):
      // unequip testination
      // ex: unequip hand
      unequipItem(command[1])
      break
    case /^use$/.test(message):
      useEquippedItem()
      break
    case /^craft \d+ \w+$/.test(message):
      // craft amount item
      // ex: craft 64 stick
      craftItem(command[2], command[1])
      break
  }
})

function sayItems (items = bot.inventory.items()) {
  const output = items.map(itemToString).join(', ')
  if (output) {
    bot.chat(output)
  } else {
    bot.chat('empty')
  }
}

function tossItem (name, amount) {
  amount = parseInt(amount, 10)
  const item = itemByName(name)
  if (!item) {
    bot.chat(`I have no ${name}`)
  } else if (amount) {
    bot.toss(item.type, null, amount, checkIfTossed)
  } else {
    bot.tossStack(item, checkIfTossed)
  }

  function checkIfTossed (err) {
    if (err) {
      bot.chat(`unable to toss: ${err.message}`)
    } else if (amount) {
      bot.chat(`tossed ${amount} x ${name}`)
    } else {
      bot.chat(`tossed ${name}`)
    }
  }
}

async function equipItem (name, destination) {
  const item = itemByName(name)
  if (item) {
    try {
      await bot.equip(item, destination)
      bot.chat(`equipped ${name}`)
    } catch (err) {
      bot.chat(`cannot equip ${name}: ${err.message}`)
    }
  } else {
    bot.chat(`I have no ${name}`)
  }
}

async function unequipItem (destination) {
  try {
    await bot.unequip(destination)
    bot.chat('unequipped')
  } catch (err) {
    bot.chat(`cannot unequip: ${err.message}`)
  }
}

function useEquippedItem () {
  bot.chat('activating item')
  bot.activateItem()
}

async function craftItem (name, amount) {
  amount = parseInt(amount, 10)
  const mcData = require('minecraft-data')(bot.version)

  const item = mcData.findItemOrBlockByName(name)
  const craftingTableID = mcData.blocksByName.crafting_table.id

  const craftingTable = bot.findBlock({
    matching: craftingTableID
  })

  if (item) {
    const recipe = bot.recipesFor(item.id, null, 1, craftingTable)[0]
    if (recipe) {
      bot.chat(`I can make ${name}`)
      try {
        await bot.craft(recipe, amount, craftingTable)
        bot.chat(`did the recipe for ${name} ${amount} times`)
      } catch (err) {
        bot.chat(`error making ${name}`)
      }
    } else {
      bot.chat(`I cannot make ${name}`)
    }
  } else {
    bot.chat(`unknown item: ${name}`)
  }
}

function itemToString (item) {
  if (item) {
    return `${item.name} x ${item.count}`
  } else {
    return '(nothing)'
  }
}

function itemByName (name) {
  return bot.inventory.items().filter(item => item.name === name)[0]
}
let mcData
bot.on('inject_allowed', () => {
  mcData = require('minecraft-data')(bot.version)
})

// To fish we have to give bot the fishing rod and teleport bot to the water
// /give fisherman fishing_rod 1
// /teleport fisherman ~ ~ ~

// To eat we have to apply hunger first
// /effect fisherman minecraft:hunger 1 255

bot.on('message', (cm) => {
  if (cm.toString().includes('start')) {
    startFishing()
  }

  if (cm.toString().includes('stop')) {
    stopFishing()
  }

  if (cm.toString().includes('eat')) {
    eat()
  }
})

let nowFishing = false

function onCollect (player, entity) {
  if (entity.kind === 'Drops' && player === bot.entity) {
    bot.removeListener('playerCollect', onCollect)
    startFishing()
  }
}

async function startFishing () {
  bot.chat('Fishing')
  try {
    await bot.equip(mcData.itemsByName.fishing_rod.id, 'hand')
  } catch (err) {
    return bot.chat(err.message)
  }

  nowFishing = true
  bot.on('playerCollect', onCollect)

  try {
    await bot.fish()
  } catch (err) {
    bot.chat(err.message)
  }
  nowFishing = false
}

function stopFishing () {
  bot.removeListener('playerCollect', onCollect)

  if (nowFishing) {
    bot.activateItem()
  }
}

async function eat () {
  stopFishing()

  try {
    await bot.equip(mcData.itemsByName.fish.id, 'hand')
  } catch (err) {
    return bot.chat(err.message)
  }

  try {
    await bot.consume()
  } catch (err) {
    return bot.chat(err.message)
  }
}

let target = null

bot.on('chat', (username, message) => {
  if (username === bot.username) return
  target = bot.players[username].entity
  let entity
  switch (message) {
    case 'forward':
      bot.setControlState('forward', true)
      break
    case 'back':
      bot.setControlState('back', true)
      break
    case 'left':
      bot.setControlState('left', true)
      break
    case 'right':
      bot.setControlState('right', true)
      break
    case 'sprint':
      bot.setControlState('sprint', true)
      break
    case 'stop':
      bot.clearControlStates()
      break
    case 'jump':
      bot.setControlState('jump', true)
      bot.setControlState('jump', false)
      break
    case 'jump a lot':
      bot.setControlState('jump', true)
      break
    case 'stop jumping':
      bot.setControlState('jump', false)
      break
    case 'attack':
      entity = bot.nearestEntity()
      if (entity) {
        bot.attack(entity, true)
      } else {
        bot.chat('no nearby entities')
      }
      break
    case 'mount':
      entity = bot.nearestEntity((entity) => { return entity.type === 'object' })
      if (entity) {
        bot.mount(entity)
      } else {
        bot.chat('no nearby objects')
      }
      break
    case 'dismount':
      bot.dismount()
      break
    case 'move vehicle forward':
      bot.moveVehicle(0.0, 1.0)
      break
    case 'move vehicle backward':
      bot.moveVehicle(0.0, -1.0)
      break
    case 'move vehicle left':
      bot.moveVehicle(1.0, 0.0)
      break
    case 'move vehicle right':
      bot.moveVehicle(-1.0, 0.0)
      break
    case 'tp':
      bot.entity.position.y += 10
      break
    case 'pos':
      bot.chat(bot.entity.position.toString())
      break
    case 'yp':
      bot.chat(`Yaw ${bot.entity.yaw}, pitch: ${bot.entity.pitch}`)
      break
  }
})

bot.once('spawn', () => {
  // keep your eyes on the target, so creepy!
  setInterval(watchTarget, 50)

  function watchTarget () {
    if (!target) return
    bot.lookAt(target.position.offset(0, target.height, 0))
  }
})

bot.on('mount', () => {
  bot.chat(`mounted ${bot.vehicle.objectType}`)
})

bot.on('dismount', (vehicle) => {
  bot.chat(`dismounted ${vehicle.objectType}`)
})