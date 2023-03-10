
import { ContractSystem, Treasure } from '@tact-lang/emulator';
import { Address, beginCell, toNano } from 'ton-core';
import { KeyPair, keyPairFromSeed, sign } from 'ton-crypto';
import { Payouts } from '../output/payouts_Payouts';

jest
    .useFakeTimers()
    .setSystemTime(new Date('2023-01-01'));

function createPayout(receiver: Address, amount: bigint, secretKey: Buffer) {
    let toSign = beginCell().storeAddress(receiver).storeCoins(amount).endCell().hash();
    let signature = sign(toSign, secretKey);
    // Align cell
    let resultSc = beginCell().storeCoins(amount).storeBuffer(signature);
    if (resultSc.bits % 8 != 0) {
        resultSc.storeUint(0, 8 - (resultSc.bits % 8));
    }

    let result = resultSc.endCell();
    return result.bits.subbuffer(0, result.bits.length)!.toString('base64');
}


describe('Payouts', () => {
    let system: ContractSystem;
    let owner: Treasure;
    let keys: KeyPair;

    beforeEach(async () => {
        system = await ContractSystem.create();

        owner = system.treasure('owner');
        system.name(owner, 'owner'); // Set a name for the contract. Useful for snapshot testing.

        keys = keyPairFromSeed(Buffer.from('ac0cebac0cebac0cebac0cebac0cebac'));
    });

    it("should deploy & topup", async () => {
        let startDate = Date.now() + 60 * 60 * 1000;
        let burnTimeout = 60 * 60;
        const contract = system.open(await Payouts.fromInit(owner.address, BigInt('0x' + keys.publicKey.toString('hex')), BigInt(Math.ceil(startDate / 1000)), BigInt(burnTimeout)));

        let track = system.track(contract);

        await contract.send(owner, {
            value: toNano(1),
            bounce: false,
        }, 'Topup');

        await system.run();

        expect(track.collect()).toMatchSnapshot();
    });

    it("should withdraw", async () => {
        let startDate = Date.now() + 60 * 60 * 1000;
        let burnTimeout = 60 * 60;
        const contract = system.open(await Payouts.fromInit(owner.address, BigInt('0x' + keys.publicKey.toString('hex')), BigInt(Math.ceil(startDate / 1000)), BigInt(burnTimeout)));

        await contract.send(owner, {
            value: toNano(100000),
            bounce: false,
        }, 'Topup');

        await system.run();

        let client = system.treasure('client');
        let track = system.track(contract);

        let payload = createPayout(client.address, toNano(10), keys.secretKey);

        await contract.send(client, {
            value: toNano(1),
            bounce: false,
        }, payload);

        await system.run();

        expect(track.collect()).toMatchSnapshot();
    });

    it("should not withdraw twice", async () => {
        let startDate = Date.now() + 60 * 60 * 1000;
        let burnTimeout = 60 * 60;
        const contract = system.open(await Payouts.fromInit(owner.address, BigInt('0x' + keys.publicKey.toString('hex')), BigInt(Math.ceil(startDate / 1000)), BigInt(burnTimeout)));

        await contract.send(owner, {
            value: toNano(100000),
            bounce: false,
        }, 'Topup');

        await system.run();

        let client = system.treasure('client');
        let track = system.track(contract);

        let payload = createPayout(client.address, toNano(10), keys.secretKey);

        await contract.send(client, {
            value: toNano(1),
            bounce: false,
        }, payload);

        await system.run();
        track.collect();

        await contract.send(client, {
            value: toNano(1),
            bounce: false,
        }, payload);

        await system.run();

        expect(track.collect()).toMatchSnapshot();
    });

    it('should start burn', async () => {
        let startDate = Math.ceil((Date.now() + 60 * 60 * 1000) / 1000);
        let burnTimeout = 60 * 60;
        const contract = system.open(await Payouts.fromInit(owner.address, BigInt('0x' + keys.publicKey.toString('hex')), BigInt(startDate), BigInt(burnTimeout)));

        await contract.send(owner, {
            value: toNano(100000),
            bounce: false,
        }, 'Topup');

        await system.run();

        system.update({
            now: startDate + burnTimeout / 2,
        });

        let client = system.treasure('client');
        let track = system.track(contract);

        let payload = createPayout(client.address, toNano(10), keys.secretKey);

        await contract.send(client, {
            value: toNano(1),
            bounce: false,
        }, payload);

        await system.run();
        expect(track.collect()).toMatchSnapshot();
    });

    it('should burn completely', async () => {
        let startDate = Math.ceil((Date.now() + 60 * 60 * 1000) / 1000);
        let burnTimeout = 60 * 60;
        const contract = system.open(await Payouts.fromInit(owner.address, BigInt('0x' + keys.publicKey.toString('hex')), BigInt(startDate), BigInt(burnTimeout)));

        await contract.send(owner, {
            value: toNano(100000),
            bounce: false,
        }, 'Topup');

        await system.run();

        system.update({
            now: startDate + burnTimeout,
        });

        let client = system.treasure('client');
        let track = system.track(contract);

        let payload = createPayout(client.address, toNano(10), keys.secretKey);

        await contract.send(client, {
            value: toNano(1),
            bounce: false,
        }, payload);

        await system.run();
        expect(track.collect()).toMatchSnapshot();
    });
});