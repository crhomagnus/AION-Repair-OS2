const uuidv4 = () => Math.random().toString(36).substr(2, 9) + Date.now().toString(36);

class AiExecutor {
    constructor(sensors, validator, adb) {
        this.sensors = sensors;
        this.validator = validator;
        this.adb = adb;
        this.cycle = 0;
        this.mode = 'MASTER_EXECUTOR';
        this.knowledgeBase = this.loadKnowledgeBase();
        this.executionHistory = [];
    }

    loadKnowledgeBase() {
        return {
            thermalThrottling: {
                condition: (state) => state.cpu > 90 && state.temperature > 45,
                hypothesis: 'Thermal throttling caused by CPU-intensive process',
                actions: [
                    { cmd: 'am force-stop', target: 'com.android.systemui', priority: 0 },
                    { cmd: 'am force-stop', target: 'com.google.android.googlequicksearchbox', priority: 1 }
                ]
            },
            memoryLeak: {
                condition: (state) => state.ram > 85 && state.latency > 20,
                hypothesis: 'Memory leak in application layer',
                actions: [
                    { cmd: 'dumpsys meminfo', target: null, priority: 0 }
                ]
            },
            highDiskUsage: {
                condition: (state) => state.disk > 90,
                hypothesis: 'Storage critically full - cache clearing recommended',
                actions: [
                    { cmd: 'pm clear', target: 'com.android.providers.downloads', priority: 0 }
                ]
            },
            batteryDrain: {
                condition: (state) => state.battery.level < 20 && !state.battery.charging,
                hypothesis: 'Abnormal battery drain detected',
                actions: [
                    { cmd: 'dumpsys battery', target: null, priority: 0 }
                ]
            },
            networkInstability: {
                condition: (state) => state.signal < -100,
                hypothesis: 'Poor network signal detected',
                actions: [
                    { cmd: 'svc wifi disable', target: null, priority: 0 },
                    { cmd: 'svc wifi enable', target: null, priority: 1 }
                ]
            },
            zombieProcesses: {
                condition: (state) => state.latency > 50,
                hypothesis: 'Zombie processes blocking scheduler',
                actions: [
                    { cmd: 'ps -A', target: null, priority: 0 }
                ]
            }
        };
    }

    shouldAct(state) {
        return Object.values(this.knowledgeBase).some(entry => entry.condition(state));
    }

    decide(state) {
        this.cycle++;
        const actions = [];

        for (const [key, entry] of Object.entries(this.knowledgeBase)) {
            if (entry.condition(state)) {
                const thought = {
                    id: uuidv4(),
                    cycle: this.cycle,
                    priority: this.getPriority(key),
                    hypothesis: entry.hypothesis,
                    sensors: { cpu: state.cpu, temp: state.temperature, ram: state.ram },
                    timestamp: Date.now()
                };

                for (const action of entry.actions) {
                    if (action.priority <= 2) {
                        const cmd = action.target 
                            ? `${action.cmd} ${action.target}`
                            : action.cmd;
                        
                        if (this.validator.validate(cmd)) {
                            actions.push(cmd);
                            this.executionHistory.push({ thought, cmd, state });
                        }
                    }
                }

                this.emitThought(thought);
            }
        }

        return actions;
    }

    getPriority(key) {
        const priorities = {
            thermalThrottling: 0,
            batteryDrain: 1,
            memoryLeak: 1,
            highDiskUsage: 2,
            networkInstability: 3,
            zombieProcesses: 4
        };
        return priorities[key] || 5;
    }

    async execute(order) {
        const state = this.sensors.getState();
        const actions = this.decide(state);

        return {
            cycle: this.cycle,
            mode: this.mode,
            state,
            actions,
            thoughts: this.executionHistory.slice(-5)
        };
    }

    emitThought(thought) {
        console.log(`[AION] ${thought.hypothesis} (Priority: ${thought.priority})`);
    }

    getHistory() {
        return this.executionHistory.slice(-50);
    }

    getStatus() {
        return {
            mode: this.mode,
            cycle: this.cycle,
            actionsExecuted: this.executionHistory.length,
            currentState: this.sensors.getState()
        };
    }
}

module.exports = AiExecutor;