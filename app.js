document.addEventListener('DOMContentLoaded', () => {
    // Input elements
    const dailyExpenseInput = document.getElementById('daily-expense');
    
    const employeeWageInput = document.getElementById('employee-wage');
    const employeeCountInput = document.getElementById('employee-count');

    // Result elements
    const monthlyExpenseResult = document.getElementById('monthly-expense-result');
    const yearlyExpenseResult = document.getElementById('yearly-expense-result');
    
    const monthlyWageResult = document.getElementById('monthly-wage-result');
    const yearlyWageResult = document.getElementById('yearly-wage-result');

    // Formatter
    const currencyFormatter = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
    });

    function formatRupiah(value) {
        return currencyFormatter.format(value);
    }

    // Calculators
    function calculateExpenses() {
        const dailyInput = parseFloat(dailyExpenseInput.value);
        
        if (isNaN(dailyInput) || dailyInput < 0) {
            monthlyExpenseResult.textContent = 'Rp 0';
            yearlyExpenseResult.textContent = 'Rp 0';
            return;
        }

        // Input is in thousands
        const dailyExpense = dailyInput * 1000;
        
        const monthlyExpense = dailyExpense * 30; // Using 30 days for 1 month
        const yearlyExpense = dailyExpense * 365; // Using 365 days for 1 year

        monthlyExpenseResult.textContent = formatRupiah(monthlyExpense);
        yearlyExpenseResult.textContent = formatRupiah(yearlyExpense);
    }

    function calculateWages() {
        const wageInput = parseFloat(employeeWageInput.value);
        const countInput = parseFloat(employeeCountInput.value);

        if (isNaN(wageInput) || isNaN(countInput) || wageInput < 0 || countInput < 0) {
            monthlyWageResult.textContent = 'Rp 0';
            yearlyWageResult.textContent = 'Rp 0';
            return;
        }

        // Wage input is in thousands
        const wagePerEmployee = wageInput * 1000;
        const employeeCount = Math.floor(countInput); // Ensure whole number

        const totalMonthlyWage = wagePerEmployee * employeeCount;
        const totalYearlyWage = totalMonthlyWage * 12;

        monthlyWageResult.textContent = formatRupiah(totalMonthlyWage);
        yearlyWageResult.textContent = formatRupiah(totalYearlyWage);
    }

    // Event Listeners
    dailyExpenseInput.addEventListener('input', calculateExpenses);
    
    employeeWageInput.addEventListener('input', calculateWages);
    employeeCountInput.addEventListener('input', calculateWages);
});
