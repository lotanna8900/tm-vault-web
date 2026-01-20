import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, usePublicClient, useChainId, useSwitchChain } from 'wagmi';
import { parseEther, formatEther, erc20Abi, parseAbiItem } from 'viem';
import { sepolia } from 'viem/chains';
import Confetti from 'react-confetti';

// Addresses
const TOKEN_ADDRESS = "0x9Eb7D564a9385AB25bfCe2603fa5ed81B79546B2"; 
const VAULT_ADDRESS = "0xcd2d4c637E606C41714C434436775fB5E7264820";
const EXPECTED_CHAIN_ID = sepolia.id;

const VAULT_ABI = [
  { inputs: [{ name: "amount", type: "uint256" }], name: "deposit", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "amount", type: "uint256" }], name: "withdraw", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "arg0", type: "address" }], name: "balances", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

const VAULTS = [
  { id: 1, name: 'Stable Vault', apy: '5-8%', risk: 'Low', color: 'bg-blue-100 text-blue-800' },
  { id: 2, name: 'Growth Vault', apy: '12-18%', risk: 'Medium', color: 'bg-indigo-100 text-indigo-800' },
  { id: 3, name: 'Turbo Vault', apy: '25-40%', risk: 'High', color: 'bg-purple-100 text-purple-800' },
];

export default function App() {
  const { login, logout, ready, authenticated } = usePrivy();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  
  const [amount, setAmount] = useState('');
  const [selectedVault, setSelectedVault] = useState(VAULTS[0]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'history'>('deposit');
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const isWrongNetwork = chainId !== EXPECTED_CHAIN_ID;

  // 1. Read Balances
  const { data: walletBal, refetch: refetchWallet } = useReadContract({
    address: TOKEN_ADDRESS as `0x${string}`, 
    abi: erc20Abi, 
    functionName: 'balanceOf', 
    args: [address as `0x${string}`], 
    query: { enabled: !!address },
  });
  
  const { data: vaultBal, refetch: refetchVault } = useReadContract({
    address: VAULT_ADDRESS as `0x${string}`, 
    abi: VAULT_ABI, 
    functionName: 'balances', 
    args: [address as `0x${string}`], 
    query: { enabled: !!address },
  });

  // 2. Transactions
  const { data: approveHash, writeContract: writeApprove, isPending: isApprovingWallet, error: approveError } = useWriteContract();
  const { isLoading: isApprovingConfirming, isSuccess: isApproved } = useWaitForTransactionReceipt({ hash: approveHash });

  const { data: depositHash, writeContract: writeDeposit, isPending: isDepositingWallet, error: depositError } = useWriteContract();
  const { isLoading: isDepositingConfirming, isSuccess: isDeposited } = useWaitForTransactionReceipt({ hash: depositHash });

  const { data: withdrawHash, writeContract: writeWithdraw, isPending: isWithdrawingWallet, error: withdrawError } = useWriteContract();
  const { isLoading: isWithdrawingConfirming, isSuccess: isWithdrawn } = useWaitForTransactionReceipt({ hash: withdrawHash });

  // 3. Fetch History
  const fetchHistory = async () => {
    if (!publicClient || !address) return;
    setIsLoadingHistory(true);
    try {
      const depositLogs = await publicClient.getLogs({
        address: VAULT_ADDRESS as `0x${string}`,
        event: parseAbiItem('event Deposit(address indexed user, uint256 amount)'),
        args: { user: address as `0x${string}` },
        fromBlock: 'earliest'
      });
      const withdrawLogs = await publicClient.getLogs({
        address: VAULT_ADDRESS as `0x${string}`,
        event: parseAbiItem('event Withdraw(address indexed user, uint256 amount)'),
        args: { user: address as `0x${string}` },
        fromBlock: 'earliest'
      });

      const formatted = [
        ...depositLogs.map(l => ({ type: 'Deposit', amount: formatEther(l.args.amount!), hash: l.transactionHash, block: l.blockNumber })),
        ...withdrawLogs.map(l => ({ type: 'Withdraw', amount: formatEther(l.args.amount!), hash: l.transactionHash, block: l.blockNumber }))
      ].sort((a, b) => Number(b.block) - Number(a.block));

      setHistory(formatted);
    } catch (e) { 
      console.error('Failed to fetch history:', e); 
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history' && address) fetchHistory();
  }, [activeTab, address, isDeposited, isWithdrawn]);

  // 4. Handle Success
  useEffect(() => {
    if (isDeposited || isWithdrawn) {
      if (isDeposited) setShowConfetti(true);
      setTimeout(() => {
        setShowConfetti(false);
        setAmount('');
        refetchWallet(); 
        refetchVault();
        if (activeTab === 'history') fetchHistory();
      }, 5000);
    }
  }, [isDeposited, isWithdrawn]);

  // 5. Handle Errors
  useEffect(() => {
    const error = approveError || depositError || withdrawError;
    if (error) {
      const message = error.message || 'Unknown error';
      if (message.includes('User rejected') || message.includes('user rejected')) {
        alert('❌ Transaction cancelled');
      } else if (message.includes('insufficient funds')) {
        alert('❌ Insufficient balance');
      } else {
        alert(`❌ Transaction failed: ${message.slice(0, 100)}`);
      }
      console.error('Transaction error:', error);
    }
  }, [approveError, depositError, withdrawError]);

  // 6. Actions
  const handlePercentage = (percent: number) => {
    const data = activeTab === 'deposit' ? walletBal : vaultBal;
    if (!data) return;
    const calculated = (Number(formatEther(data)) * percent).toFixed(6);
    setAmount(calculated);
    vibrate();
  };

  const handleApprove = () => {
    if (!amount || Number(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    try {
      writeApprove({ 
        address: TOKEN_ADDRESS as `0x${string}`, 
        abi: erc20Abi, 
        functionName: 'approve', 
        args: [VAULT_ADDRESS as `0x${string}`, parseEther(amount)] 
      });
      vibrate();
    } catch (error) {
      console.error('Approve error:', error);
    }
  };

  const handleAction = () => {
    if (!amount || Number(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    
    const maxBal = activeTab === 'deposit' ? walletBal : vaultBal;
    if (maxBal && parseEther(amount) > maxBal) {
      alert('Insufficient balance');
      return;
    }
    
    try {
      const fn = activeTab === 'deposit' ? 'deposit' : 'withdraw';
      const write = activeTab === 'deposit' ? writeDeposit : writeWithdraw;
      write({ 
        address: VAULT_ADDRESS as `0x${string}`, 
        abi: VAULT_ABI, 
        functionName: fn, 
        args: [parseEther(amount)] 
      });
      vibrate();
    } catch (error) {
      console.error('Action error:', error);
    }
  };

  const vibrate = () => {
    if (navigator.vibrate) navigator.vibrate(50);
  };

  const getButtonText = () => {
    if (isDepositingWallet || isWithdrawingWallet) return '⏳ Waiting for wallet...';
    if (isDepositingConfirming) return '⏳ Confirming deposit...';
    if (isWithdrawingConfirming) return '⏳ Confirming withdrawal...';
    return activeTab === 'deposit' ? '2. Deposit Funds' : 'Withdraw Funds';
  };

  const isWorking = isApprovingWallet || isApprovingConfirming || isDepositingWallet || isDepositingConfirming || isWithdrawingWallet || isWithdrawingConfirming;
  const estimatedShares = amount && !isNaN(Number(amount)) ? Number(amount).toFixed(2) : '0.00';

  if (!ready) return (
    <div className="flex h-screen items-center justify-center bg-gray-100">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col items-center justify-center p-4">
      {showConfetti && <Confetti width={window.innerWidth} height={window.innerHeight} recycle={false} />}
      
      <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md border border-gray-200">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">TM Vaults</h1>
          {authenticated && (
            <button 
              onClick={logout}
              className="text-xs text-gray-500 hover:text-red-600 font-medium transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>

        {/* Wallet Address */}
        {authenticated && address && (
          <div className="text-center mb-4">
            <span className="bg-gray-100 px-3 py-1.5 rounded-full text-xs font-mono text-gray-700">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
          </div>
        )}

        {/* Wrong Network Warning */}
        {authenticated && isWrongNetwork && (
          <div className="bg-red-50 border border-red-200 p-3 rounded-xl mb-4">
            <p className="text-red-800 text-sm font-semibold mb-2">⚠️ Wrong Network</p>
            <p className="text-red-600 text-xs mb-3">Please switch to Base network</p>
            <button 
              onClick={() => switchChain({ chainId: EXPECTED_CHAIN_ID })}
              className="w-full bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-700 transition-colors"
            >
              Switch to Base
            </button>
          </div>
        )}

        {!authenticated ? (
          <div className="space-y-4">
            <div className="text-center py-8">
              <div className="text-6xl mb-4">🏦</div>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Welcome to TM Vaults</h2>
              <p className="text-sm text-gray-500">Secure, non-custodial yields</p>
            </div>
            <button 
              onClick={login} 
              className="w-full bg-black text-white py-3.5 rounded-xl font-bold hover:bg-gray-800 transition-colors"
            >
              Connect Wallet
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Portfolio Summary */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-100">
              <p className="text-xs text-gray-600 mb-1">Total Portfolio</p>
              <p className="text-2xl font-bold text-gray-900 mb-3">
                ${vaultBal ? Number(formatEther(vaultBal)).toFixed(2) : '0.00'}
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-gray-500">Wallet Balance</p>
                  <p className="font-bold text-gray-800">{walletBal ? Number(formatEther(walletBal)).toFixed(2) : '0.00'} USDC</p>
                </div>
                <div>
                  <p className="text-gray-500">Vault Balance</p>
                  <p className="font-bold text-gray-800">{vaultBal ? Number(formatEther(vaultBal)).toFixed(2) : '0.00'} USDC</p>
                </div>
              </div>
            </div>
            
            {/* TABS */}
            <div className="flex bg-gray-100 p-1 rounded-xl">
              {['deposit', 'withdraw', 'history'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab as any); setAmount(''); vibrate(); }}
                  className={`flex-1 py-2 text-xs font-bold capitalize rounded-lg transition-all ${
                    activeTab === tab ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {activeTab === 'history' ? (
              // HISTORY VIEW
              <div className="h-64 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {isLoadingHistory ? (
                  <p className="text-center text-gray-400 text-sm mt-10">Loading transactions...</p>
                ) : history.length === 0 ? (
                  <div className="text-center mt-10">
                    <p className="text-4xl mb-2">📜</p>
                    <p className="text-gray-400 text-sm">No transactions yet</p>
                  </div>
                ) : (
                  history.map((tx) => (
                    <div key={tx.hash} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg ${tx.type === 'Deposit' ? 'bg-green-100' : 'bg-red-100'}`}>
                          {tx.type === 'Deposit' ? '⬇️' : '⬆️'}
                        </div>
                        <div>
                          <p className="font-bold text-sm text-gray-800">{tx.type}</p>
                          <a 
                            href={`https://basescan.org/tx/${tx.hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline"
                          >
                            {tx.hash.slice(0,6)}...{tx.hash.slice(-4)}
                          </a>
                        </div>
                      </div>
                      <span className={`font-mono font-bold text-sm ${tx.type === 'Deposit' ? 'text-green-600' : 'text-red-600'}`}>
                        {tx.type === 'Deposit' ? '+' : '-'}{Number(tx.amount).toFixed(2)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            ) : (
              // DEPOSIT/WITHDRAW VIEW
              <>
                <div className="grid grid-cols-3 gap-2">
                  {VAULTS.map((vault) => (
                    <button 
                      key={vault.id} 
                      onClick={() => { setSelectedVault(vault); vibrate(); }} 
                      className={`p-2 rounded-xl border text-left transition-all ${
                        selectedVault.id === vault.id 
                          ? 'border-blue-500 bg-blue-50 shadow-sm' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${vault.color} font-bold`}>
                        {vault.risk}
                      </span>
                      <div className="mt-2 font-bold text-xs">{vault.name}</div>
                      <div className="text-[10px] text-gray-500">{vault.apy} APY</div>
                    </button>
                  ))}
                </div>

                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-600 capitalize">{activeTab} Amount</span>
                    <span className="text-xs text-gray-500">
                      Available: {activeTab === 'deposit' 
                        ? (walletBal ? Number(formatEther(walletBal)).toFixed(2) : '0.00') 
                        : (vaultBal ? Number(formatEther(vaultBal)).toFixed(2) : '0.00')
                      } USDC
                    </span>
                  </div>
                  <input 
                    type="number" 
                    value={amount} 
                    onChange={(e) => setAmount(e.target.value)} 
                    placeholder="0.00" 
                    className="w-full p-3 border border-gray-200 rounded-lg font-mono text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isWorking || isWrongNetwork}
                  />
                  <div className="flex gap-2 mt-3">
                    {[0.25, 0.50, 0.75, 1].map((pct) => (
                      <button 
                        key={pct} 
                        onClick={() => handlePercentage(pct)} 
                        className="flex-1 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded hover:bg-gray-100 transition-colors"
                        disabled={isWorking || isWrongNetwork}
                      >
                        {pct === 1 ? 'MAX' : `${pct * 100}%`}
                      </button>
                    ))}
                  </div>
                  {activeTab === 'deposit' && amount && (
                    <div className="text-xs text-gray-600 mt-3 bg-white p-2 rounded border border-gray-200">
                      You will receive: <span className="font-bold text-gray-800">{estimatedShares}</span> vault shares
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {activeTab === 'deposit' && (
                    <button 
                      onClick={handleApprove}
                      disabled={isApprovingWallet || isApprovingConfirming || isApproved || !amount || isWrongNetwork}
                      className={`py-3.5 rounded-xl font-bold text-white transition-all ${
                        isApproved 
                          ? 'bg-green-600' 
                          : isApprovingWallet || isApprovingConfirming
                          ? 'bg-gray-400'
                          : 'bg-indigo-600 hover:bg-indigo-700'
                      }`}
                    >
                      {isApprovingWallet 
                        ? '⏳ Waiting for wallet...' 
                        : isApprovingConfirming 
                        ? '⏳ Confirming approval...' 
                        : isApproved 
                        ? '✅ Approved' 
                        : '1. Approve USDC'
                      }
                    </button>
                  )}
                  <button 
                    onClick={handleAction} 
                    disabled={isWorking || (activeTab === 'deposit' && !isApproved) || !amount || isWrongNetwork} 
                    className={`py-3.5 rounded-xl font-bold text-white transition-all ${
                      isWorking || (activeTab === 'deposit' && !isApproved) || isWrongNetwork
                        ? 'bg-gray-400 cursor-not-allowed' 
                        : activeTab === 'deposit' 
                        ? 'bg-green-600 hover:bg-green-700' 
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    {getButtonText()}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="text-xs text-gray-400 mt-6 text-center">
        Powered by Privy • Base Network
      </p>
    </div>
  );
}