const config = {
    type: Phaser.AUTO,
    width: 600,
    height: 400,
    parent: 'game-container',
    backgroundColor: '#7cfc00', 
    scene: {
        create: create
    }
};

const game = new Phaser.Game(config);

function create() {
    const plots = [
        { x: 150, y: 150 }, { x: 300, y: 150 }, { x: 450, y: 150 },
        { x: 150, y: 280 }, { x: 300, y: 280 }, { x: 450, y: 280 }
    ];

    plots.forEach(pos => {
        createPlot(this, pos.x, pos.y);
    });
}

function createPlot(scene, x, y) {
    let plotBase = scene.add.rectangle(x, y, 100, 100, 0x8b4513).setInteractive();

    plotBase.state = 'EMPTY'; 
    let plant = scene.add.circle(x, y, 30, 0x2ecc71).setVisible(false);
    let label = scene.add.text(x - 30, y + 20, '', { fontSize: '14px' });

    plotBase.on('pointerdown', () => {
        if (plotBase.state === 'EMPTY') {
            plotBase.state = 'GROWING';
            plant.setVisible(true).setScale(0.5);
            label.setText('growing...');
            scene.time.delayedCall(3000, () => {
                plotBase.state = 'READY';
                plant.setFillStyle(0xf1c40f); 
                plant.setScale(1.1);
                label.setText('harvest!');
            });
        } 
        else if (plotBase.state === 'READY') {
            plotBase.state = 'EMPTY';
            plant.setVisible(false);
            scene.time.delayedCall(1000, () => label.setText(''));
        }
    });

    plotBase.on('pointerover', () => plotBase.setStrokeStyle(2, 0xffffff));
    plotBase.on('pointerout', () => plotBase.setStrokeStyle(0));
}