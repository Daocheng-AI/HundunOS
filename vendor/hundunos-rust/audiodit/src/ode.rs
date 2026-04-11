//! ODE Solvers for Diffusion

use ndarray::Array1;

// ================================================================
// Euler ODE Solver
// ================================================================

/// Simple Euler ODE integrator
/// 
/// Equivalent to `torchdiffeq.odeint` with `method='euler'`
/// 
/// # Arguments
/// * `fn` - callable(t, y) → dy/dt
/// * `y0` - initial state tensor
/// * `t` - 1-D tensor of time steps (must be monotonically increasing)
/// 
/// # Returns
/// Tensor of shape `(len(t), *y0.shape)` containing the trajectory
pub fn odeint_euler<F>(f: F, y0: &Array1<f32>, t: &[f32]) -> Vec<Array1<f32>>
where
    F: Fn(f32, &Array1<f32>) -> Array1<f32>,
{
    let mut ys = Vec::with_capacity(t.len());
    ys.push(y0.clone());
    
    let mut y = y0.clone();
    for i in 0..t.len() - 1 {
        let dt = t[i + 1] - t[i];
        let dy = f(t[i], &y);
        y = &y + &(&dy * dt);
        ys.push(y.clone());
    }
    
    ys
}

// ================================================================
// Heun's Method (2nd order Runge-Kutta)
// ================================================================

/// Heun's method for improved accuracy
/// 
/// This is a predictor-corrector method:
/// 1. Predict: y_pred = y + dt * f(t, y)
/// 2. Correct: y_next = y + dt/2 * (f(t, y) + f(t+dt, y_pred))
pub fn odeint_heun<F>(f: F, y0: &Array1<f32>, t: &[f32]) -> Vec<Array1<f32>>
where
    F: Fn(f32, &Array1<f32>) -> Array1<f32>,
{
    let mut ys = Vec::with_capacity(t.len());
    ys.push(y0.clone());
    
    let mut y = y0.clone();
    for i in 0..t.len() - 1 {
        let dt = t[i + 1] - t[i];
        
        // Predictor
        let k1 = f(t[i], &y);
        let y_pred = &y + &(&k1 * dt);
        
        // Corrector
        let k2 = f(t[i] + dt, &y_pred);
        y = &y + &(&(&k1 + &k2) * (dt / 2.0));
        
        ys.push(y.clone());
    }
    
    ys
}

// ================================================================
// RK4 (4th order Runge-Kutta)
// ================================================================

/// 4th order Runge-Kutta method
#[allow(dead_code)]
pub fn odeint_rk4<F>(f: F, y0: &Array1<f32>, t: &[f32]) -> Vec<Array1<f32>>
where
    F: Fn(f32, &Array1<f32>) -> Array1<f32>,
{
    let mut ys = Vec::with_capacity(t.len());
    ys.push(y0.clone());
    
    let mut y = y0.clone();
    for i in 0..t.len() - 1 {
        let dt = t[i + 1] - t[i];
        let t_i = t[i];
        
        let k1 = f(t_i, &y);
        let k2 = f(t_i + dt / 2.0, &(&y + &(&k1 * (dt / 2.0))));
        let k3 = f(t_i + dt / 2.0, &(&y + &(&k2 * (dt / 2.0))));
        let k4 = f(t_i + dt, &(&y + &(&k3 * dt)));
        
        y = &y + &(&(&(&k1 + &(&k2 * 2.0)) + &(&k3 * 2.0)) + &k4) * (dt / 6.0);
        
        ys.push(y.clone());
    }
    
    ys
}

// ================================================================
// Adaptive Step Size
// ================================================================

/// Adaptive step size Euler method
/// 
/// Adjusts step size based on estimated error
#[allow(dead_code)]
pub fn odeint_adaptive<F>(
    f: F,
    y0: &Array1<f32>,
    t_start: f32,
    t_end: f32,
    tol: f32,
) -> Vec<Array1<f32>>
where
    F: Fn(f32, &Array1<f32>) -> Array1<f32>,
{
    let mut ys = Vec::new();
    ys.push(y0.clone());
    
    let mut t = t_start;
    let mut y = y0.clone();
    let mut dt = (t_end - t_start) / 16.0; // Initial step
    
    while t < t_end {
        // Ensure we don't overshoot
        if t + dt > t_end {
            dt = t_end - t;
        }
        
        // Euler step
        let dy = f(t, &y);
        let y_next = &y + &(&dy * dt);
        
        // Error estimate (half step)
        let y_half = &y + &(&dy * (dt / 2.0));
        let dy_half = f(t + dt / 2.0, &y_half);
        let y_next_half = &y_half + &(&dy_half * (dt / 2.0));
        
        // Compute error
        let error: f32 = (&y_next - &y_next_half)
            .iter()
            .map(|x| x * x)
            .sum::<f32>()
            .sqrt();
        
        // Adjust step size
        if error < tol {
            // Accept step
            t += dt;
            y = y_next_half;
            ys.push(y.clone());
            
            // Increase step size
            dt *= 1.5;
        } else {
            // Reject step, decrease step size
            dt /= 2.0;
        }
    }
    
    ys
}

// ================================================================
// Time Schedule
// ================================================================

/// Generate time steps for diffusion
pub fn generate_timesteps(steps: usize) -> Vec<f32> {
    (0..=steps)
        .map(|i| i as f32 / steps as f32)
        .collect()
}

/// Log-SNR schedule (better for audio)
#[allow(dead_code)]
pub fn logsnr_schedule(t: f32) -> f32 {
    // Log-SNR decreases from high to low
    -5.0 * t.log10()
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_euler_simple() {
        // dy/dt = y, y(0) = 1 → y = e^t
        let f = |_t: f32, y: &Array1<f32>| y.clone();
        let y0 = Array1::from_elem(1, 1.0);
        let t = vec![0.0, 0.5, 1.0];
        
        let ys = odeint_euler(f, &y0, &t);
        
        // Check that y grows
        assert!(ys[2][0] > ys[1][0]);
        assert!(ys[1][0] > ys[0][0]);
    }
    
    #[test]
    fn test_heun_accuracy() {
        // Compare Heun vs Euler for dy/dt = y
        let f = |_t: f32, y: &Array1<f32>| y.clone();
        let y0 = Array1::from_elem(1, 1.0);
        let t: Vec<f32> = (0..=10).map(|i| i as f32 / 10.0).collect();
        
        let ys_euler = odeint_euler(&f, &y0, &t);
        let ys_heun = odeint_heun(&f, &y0, &t);
        
        // Heun should be closer to true value e^1 ≈ 2.718
        let true_val = 1.0_f32.exp();
        let euler_error = (ys_euler[10][0] - true_val).abs();
        let heun_error = (ys_heun[10][0] - true_val).abs();
        
        assert!(heun_error < euler_error);
    }
    
    #[test]
    fn test_timesteps() {
        let t = generate_timesteps(16);
        assert_eq!(t.len(), 17);
        assert!((t[0] - 0.0).abs() < 1e-5);
        assert!((t[16] - 1.0).abs() < 1e-5);
    }
}
